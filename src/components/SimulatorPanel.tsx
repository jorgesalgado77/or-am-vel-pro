import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileDown, Lock, LockOpen, Upload, Save, UserPlus, FileText, X, Handshake, Trash2, RotateCcw, EyeOff, Eye } from "lucide-react";
import { AIStrategyPanel } from "@/components/AIStrategyPanel";
import { useConversionHistory } from "@/hooks/useConversionHistory";
import { maskCpfCnpj, maskPhone, isCnpj, validateCpfCnpj } from "@/lib/masks";
import { calculateSimulation, formatCurrency, formatPercent, type FormaPagamento, type SimulationInput, type BoletoRateData, type CreditRateData } from "@/lib/financing";
import { generateOrcamentoNumber, applyDiscounts, FORMAS_PAGAMENTO_LABELS } from "@/services/financialService";
import { validateFileUpload } from "@/lib/validation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateSimulationPdf } from "@/lib/generatePdf";
import { ContractEditorDialog } from "@/components/ContractEditorDialog";
import { CloseSaleModal } from "@/components/CloseSaleModal";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useDealRoom } from "@/hooks/useDealRoom";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDiscountOptions } from "@/hooks/useDiscountOptions";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useTenantPlanContext } from "@/hooks/useTenantPlan";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { openContractPrintWindow } from "@/lib/contractDocument";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "A vista", label: "À Vista" },
  { value: "Pix", label: "Pix" },
  { value: "Credito", label: "Cartão de Crédito" },
  { value: "Boleto", label: "Boleto" },
  { value: "Credito / Boleto", label: "Crédito + Boleto" },
  { value: "Entrada e Entrega", label: "Entrada e Entrega" },
];

const CARENCIA_OPTIONS: { value: "30" | "60" | "90"; label: string }[] = [
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

interface SimulatorPanelProps {
  client?: Client | null;
  onBack?: () => void;
  onClientCreated?: () => void;
}

// Keys for sessionStorage persistence
const SIM_STORAGE_KEY = "simulator_state";

interface StoredEnvironment {
  id: string;
  fileName: string;
  environmentName: string;
  pieceCount: number;
  totalValue: number;
  importedAt: string;
}

interface ImportedEnvironment {
  id: string;
  fileName: string;
  environmentName: string;
  pieceCount: number;
  totalValue: number;
  importedAt: Date;
  file: File;
}

interface SimulatorStoredState {
  valorTela: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  formaPagamento: FormaPagamento;
  parcelas: number;
  valorEntrada: number;
  plusPercentual: number;
  carenciaDias: 30 | 60 | 90;
  selectedIndicadorId: string;
  desconto3Unlocked: boolean;
  plusUnlocked: boolean;
  environments: StoredEnvironment[];
}

function loadStoredState(): Partial<SimulatorStoredState> {
  try {
    const raw = sessionStorage.getItem(SIM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function SimulatorPanel({ client, onBack, onClientCreated }: SimulatorPanelProps) {
  // Only restore stored state if there's an active client context or stored data is fresh
  const stored = useMemo(() => {
    if (client) return loadStoredState();
    // No client — check if stored state has a nonzero valorTela (user was mid-edit)
    const s = loadStoredState();
    return s.valorTela ? s : {};
  }, []);

  const savedRef = useRef(false);

  const [valorTela, setValorTela] = useState(stored.valorTela ?? 0);
  const [desconto1, setDesconto1] = useState(stored.desconto1 ?? 0);
  const [desconto2, setDesconto2] = useState(stored.desconto2 ?? 0);
  const [desconto3, setDesconto3] = useState(stored.desconto3 ?? 0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(stored.formaPagamento ?? "A vista");
  const [parcelas, setParcelas] = useState(stored.parcelas ?? 1);
  const [valorEntrada, setValorEntrada] = useState(stored.valorEntrada ?? 0);
  const [plusPercentual, setPlusPercentual] = useState(stored.plusPercentual ?? 0);
  const [carenciaDias, setCarenciaDias] = useState<30 | 60 | 90>(stored.carenciaDias ?? 30);
  const [saving, setSaving] = useState(false);
  const [desconto3Unlocked, setDesconto3Unlocked] = useState(stored.desconto3Unlocked ?? false);
  const [plusUnlocked, setPlusUnlocked] = useState(stored.plusUnlocked ?? false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingUnlock, setPendingUnlock] = useState<"desconto3" | "plus" | null>(null);

  // Imported file state
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [selectedIndicadorId, setSelectedIndicadorId] = useState(stored.selectedIndicadorId ?? client?.indicador_id ?? "");
  const [hideIndicador, setHideIndicador] = useState(false);

  // Sync indicador from client when client changes
  useEffect(() => {
    if (client?.indicador_id) {
      setSelectedIndicadorId(client.indicador_id);
    }
  }, [client?.id, client?.indicador_id]);

  const [environments, setEnvironments] = useState<ImportedEnvironment[]>(() => {
    return (stored.environments || []).map((e) => ({
      ...e,
      importedAt: new Date(e.importedAt),
      file: new File([], e.fileName), // placeholder — original file can't be restored
    }));
  });

  // Persist state to sessionStorage on changes (memory effect while on screen)
  useEffect(() => {
    const state: SimulatorStoredState = {
      valorTela, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
      carenciaDias, selectedIndicadorId, desconto3Unlocked, plusUnlocked,
      environments: environments.map(({ file, importedAt, ...rest }) => ({
        ...rest,
        importedAt: importedAt.toISOString(),
      })),
    };
    sessionStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(state));
  }, [valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, carenciaDias, selectedIndicadorId, desconto3Unlocked, plusUnlocked, environments]);

  // Clear sessionStorage on unmount if simulation was NOT saved
  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        sessionStorage.removeItem(SIM_STORAGE_KEY);
      }
    };
  }, []);

  // New client form state (when no client is provided)
  const [showClientForm, setShowClientForm] = useState(false);
  const [newClient, setNewClient] = useState({
    nome: "", cpf: "", telefone1: "", telefone2: "", email: "",
    vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "",
  });

  const { settings } = useCompanySettings();
  const { hasPermission, currentUser } = useCurrentUser();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  useEffect(() => { getResolvedTenantId().then(setResolvedTenantId); }, []);
  const { getOptionsForField } = useDiscountOptions();
  const { projetistas } = useUsuarios();
  const { activeIndicadores } = useIndicadores();
  const { isFeatureAllowed } = useTenantPlanContext();
  const canHideIndicador = isFeatureAllowed("ocultar_indicador");
  const { validateAccess, recordSale, access: dealRoomAccess, loading: dealRoomLoading } = useDealRoom();
  const conversionStats = useConversionHistory((settings as any)?.tenant_id || null);

  // Get the selected indicador's commission
  const selectedIndicador = activeIndicadores.find(i => i.id === selectedIndicadorId);
  const comissaoPercentual = selectedIndicador ? selectedIndicador.comissao_percentual : 0;
  const valorTelaComComissao = valorTela * (1 + comissaoPercentual / 100);

  const { rates: boletoRates, providers: boletoProviders } = useFinancingRates("boleto");
  const { rates: creditoRates, providers: creditoProviders } = useFinancingRates("credito");

  const [selectedBoletoProvider, setSelectedBoletoProvider] = useState("");
  const [selectedCreditoProvider, setSelectedCreditoProvider] = useState("");

  useEffect(() => {
    if (boletoProviders.length > 0 && !selectedBoletoProvider) setSelectedBoletoProvider(boletoProviders[0]);
  }, [boletoProviders]);

  useEffect(() => {
    if (creditoProviders.length > 0 && !selectedCreditoProvider) setSelectedCreditoProvider(creditoProviders[0]);
  }, [creditoProviders]);

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(formaPagamento);
  const showPlus = ["A vista", "Pix"].includes(formaPagamento);
  const showCarencia = ["Boleto", "Credito / Boleto"].includes(formaPagamento);

  const currentBoletoRates = useMemo(() =>
    boletoRates.filter((r) => r.provider_name === selectedBoletoProvider),
    [boletoRates, selectedBoletoProvider]
  );
  const currentCreditoRates = useMemo(() =>
    creditoRates.filter((r) => r.provider_name === selectedCreditoProvider),
    [creditoRates, selectedCreditoProvider]
  );

  const maxBoletoInstallments = useMemo(() =>
    currentBoletoRates.length > 0 ? Math.max(...currentBoletoRates.map((r) => r.installments)) : 12,
    [currentBoletoRates]
  );
  const maxCreditoInstallments = useMemo(() =>
    currentCreditoRates.length > 0 ? Math.max(...currentCreditoRates.map((r) => r.installments)) : 12,
    [currentCreditoRates]
  );

  const maxParcelas = formaPagamento === "Boleto" ? maxBoletoInstallments
    : formaPagamento === "Credito" || formaPagamento === "Credito / Boleto" ? maxCreditoInstallments : 12;

  const { boletoCoeffMap, boletoRatesFullMap } = useMemo(() => {
    const coeffMap: Record<number, number> = {};
    const fullMap: Record<number, BoletoRateData> = {};
    currentBoletoRates.forEach((r) => {
      coeffMap[r.installments] = Number(r.coefficient);
      fullMap[r.installments] = {
        coefficient: Number(r.coefficient),
        taxa_fixa: Number(r.taxa_fixa),
        coeficiente_60: Number(r.coeficiente_60),
        coeficiente_90: Number(r.coeficiente_90),
      };
    });
    return { boletoCoeffMap: coeffMap, boletoRatesFullMap: fullMap };
  }, [currentBoletoRates]);

  const { creditoCoeffMap, creditoRatesFullMap } = useMemo(() => {
    const coeffMap: Record<number, number> = {};
    const fullMap: Record<number, { coefficient: number; taxa_fixa: number }> = {};
    currentCreditoRates.forEach((r) => {
      coeffMap[r.installments] = Number(r.coefficient);
      fullMap[r.installments] = {
        coefficient: Number(r.coefficient),
        taxa_fixa: Number(r.taxa_fixa),
      };
    });
    return { creditoCoeffMap: coeffMap, creditoRatesFullMap: fullMap };
  }, [currentCreditoRates]);

  const result = useMemo(() => {
    const input: SimulationInput = {
      valorTela: valorTelaComComissao, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
      creditRates: creditoCoeffMap,
      creditRatesFull: creditoRatesFullMap,
      boletoRates: boletoCoeffMap,
      boletoRatesFull: boletoRatesFullMap,
      carenciaDias,
    };
    return calculateSimulation(input);
  }, [valorTelaComComissao, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, boletoCoeffMap, boletoRatesFullMap, creditoCoeffMap, creditoRatesFullMap, carenciaDias]);

  const requestUnlock = (field: "desconto3" | "plus") => {
    if (field === "desconto3" && hasPermission("desconto3")) { setDesconto3Unlocked(true); return; }
    if (field === "plus" && hasPermission("plus")) { setPlusUnlocked(true); return; }

    const requiredPassword = field === "desconto3" ? settings.manager_password : settings.admin_password;
    if (!requiredPassword) {
      if (field === "desconto3") setDesconto3Unlocked(true);
      else setPlusUnlocked(true);
      return;
    }
    setPendingUnlock(field);
    setPasswordInput("");
    setPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = () => {
    const requiredPassword = pendingUnlock === "desconto3" ? settings.manager_password : settings.admin_password;
    if (passwordInput === requiredPassword) {
      if (pendingUnlock === "desconto3") setDesconto3Unlocked(true);
      else if (pendingUnlock === "plus") setPlusUnlocked(true);
      setPasswordDialogOpen(false);
      toast.success("Acesso liberado!");

      // Audit: field unlocked
      const userInfo = getAuditUserInfo();
      logAudit({
        acao: pendingUnlock === "desconto3" ? "desconto_desbloqueado" : "plus_desbloqueado",
        entidade: "security",
        detalhes: { campo: pendingUnlock, cliente: client?.nome },
        ...userInfo,
      });
    } else {
      toast.error("Senha incorreta");
    }
    setPasswordInput("");
  };

  const handleFileImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.xml";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      Array.from(files).forEach((file) => {
        const fileValidation = validateFileUpload(file);
        if (!fileValidation.valid) {
          toast.error(fileValidation.message || "Arquivo inválido");
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          if (!content) return;

          let total: number | null = null;
          let envName = file.name.replace(/\.(txt|xml)$/i, "");
          let pieces = 0;

          if (file.name.toLowerCase().endsWith(".xml")) {
            const matchTotal = content.match(/<(?:Total|ValorTotal|TOTAL|valor_total)[^>]*>\s*([\d.,]+)\s*</i);
            if (matchTotal) total = parseFloat(matchTotal[1].replace(/\./g, "").replace(",", "."));
            // Try to extract environment name
            const matchEnv = content.match(/<(?:Ambiente|NomeAmbiente|AMBIENTE|ambiente)[^>]*>\s*([^<]+)\s*</i);
            if (matchEnv) envName = matchEnv[1].trim();
            // Try to extract piece count
            const matchPieces = content.match(/<(?:QtdPecas|Quantidade|QTD|qtd_pecas|TotalPecas)[^>]*>\s*(\d+)\s*</i);
            if (matchPieces) pieces = parseInt(matchPieces[1]);
          } else {
            const matchTotal = content.match(/Total\s*=\s*([\d.,]+)/i);
            if (matchTotal) total = parseFloat(matchTotal[1].replace(",", "."));
            // Try environment name
            const matchEnv = content.match(/Ambiente\s*[=:]\s*(.+)/i);
            if (matchEnv) envName = matchEnv[1].trim();
            // Count pieces from TXT - sum quantity column values
            const lines = content.split(/\r?\n/).filter(l => l.trim());
            let itemCount = 0;
            let foundExplicit = false;

            // First try explicit piece count pattern
            const matchPieces = content.match(/(?:Pecas|Peças|Quantidade\s*(?:de\s*)?(?:Pe[çc]as)?|Total\s*de\s*Pe[çc]as|Qtd\s*(?:Pe[çc]as)?)\s*[=:]\s*(\d+)/i);
            if (matchPieces) {
              itemCount = parseInt(matchPieces[1]);
              foundExplicit = true;
            }

            if (!foundExplicit) {
              // Detect if file uses tabular format with separators
              const hasTabs = content.includes('\t');
              const hasSemicolons = content.includes(';');
              const hasPipes = content.includes('|');
              const separator = hasTabs ? /\t/ : hasSemicolons ? /;/ : hasPipes ? /\|/ : null;

              for (const line of lines) {
                const trimmed = line.trim();
                // Skip known non-data lines
                if (/^(Total|Ambiente|Pecas|Peças|Quantidade|Descri|Nome|Projeto|Observ|Data|Vers|---|\*|#|=)/i.test(trimmed)) continue;
                if (trimmed.length < 3) continue;
                // Skip lines that look like dates (dd/mm/yyyy)
                if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) continue;
                // Skip lines that are purely numeric (page numbers, totals, etc.)
                if (/^[\d.,]+$/.test(trimmed)) continue;
                
                if (separator) {
                  // Tabular data: extract quantity from first column
                  const cols = trimmed.split(separator);
                  if (cols.length >= 2) {
                    const firstCol = cols[0].trim();
                    const qty = parseInt(firstCol);
                    if (!isNaN(qty) && qty > 0 && qty < 10000) {
                      itemCount += qty;
                    }
                  }
                } else {
                  // Space-separated: try to extract leading quantity
                  const leadingQty = trimmed.match(/^(\d+)\s+\S/);
                  if (leadingQty) {
                    const qty = parseInt(leadingQty[1]);
                    if (qty > 0 && qty < 10000) {
                      itemCount += qty;
                    }
                  }
                }
              }
            }
            pieces = itemCount;
          }

          if (total && !isNaN(total)) {
            const newEnv: ImportedEnvironment = {
              id: crypto.randomUUID(),
              fileName: file.name,
              environmentName: envName,
              pieceCount: pieces,
              totalValue: total,
              importedAt: new Date(),
              file,
            };
            setEnvironments((prev) => [...prev, newEnv]);
            setImportedFile(file);
            toast.success(`Ambiente "${envName}" importado: ${formatCurrency(total)}`);
          } else {
            toast.error(`Não foi possível encontrar o valor total em ${file.name}`);
          }
        };
        reader.readAsText(file);
      });
    };
    input.click();
  };

  // Update valorTela whenever environments change
  useEffect(() => {
    if (environments.length > 0) {
      const sum = environments.reduce((acc, env) => acc + env.totalValue, 0);
      setValorTela(sum);
    }
  }, [environments]);

  const handleRemoveEnvironment = (envId: string) => {
    setEnvironments((prev) => {
      const updated = prev.filter((e) => e.id !== envId);
      if (updated.length === 0) {
        setValorTela(0);
        setImportedFile(null);
      }
      return updated;
    });
    toast.success("Ambiente removido");
  };

  const canDeleteEnvironment = useMemo(() => {
    const cargoNome = currentUser?.cargo_nome?.toUpperCase() || "";
    return cargoNome.includes("ADMIN") || cargoNome.includes("GERENTE");
  }, [currentUser]);

  const uploadFile = async (file: File, clientId: string): Promise<{ url: string; nome: string } | null> => {
    const ext = file.name.split(".").pop() || "txt";
    const path = `projetos/${clientId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file);
    if (error) { console.error("Upload error:", error); return null; }
    const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
    return { url: urlData.publicUrl, nome: file.name };
  };

  const handleSave = async () => {
    let clientId = client?.id;

    // If no client, create one first
    if (!clientId) {
      if (!showClientForm) {
        setShowClientForm(true);
        return;
      }
      if (!newClient.nome.trim()) {
        toast.error("Nome do cliente é obrigatório");
        return;
      }
      setSaving(true);

      // Generate orçamento number
      const { numero_orcamento: numeroOrcamento, numero_orcamento_seq: nextSeq } = await generateOrcamentoNumber();

      const { data: created, error: clientError } = await supabase
        .from("clients")
        .insert({
          nome: newClient.nome.trim(),
          cpf: newClient.cpf || null,
          telefone1: newClient.telefone1 || null,
          telefone2: newClient.telefone2 || null,
          email: newClient.email || null,
          vendedor: newClient.vendedor || null,
          quantidade_ambientes: newClient.quantidade_ambientes || 0,
          descricao_ambientes: newClient.descricao_ambientes || null,
          indicador_id: newClient.indicador_id || null,
          numero_orcamento: numeroOrcamento,
          numero_orcamento_seq: nextSeq,
        } as any)
        .select("id")
        .single();

      if (clientError || !created) {
        toast.error("Erro ao cadastrar cliente");
        setSaving(false);
        return;
      }
      clientId = created.id;
      onClientCreated?.();
    } else {
      setSaving(true);
    }

    // Upload file if exists
    let arquivoUrl: string | null = null;
    let arquivoNome: string | null = null;
    if (importedFile) {
      const uploaded = await uploadFile(importedFile, clientId);
      if (uploaded) {
        arquivoUrl = uploaded.url;
        arquivoNome = uploaded.nome;
      }
    }

    const { error } = await supabase.from("simulations").insert({
      client_id: clientId,
      valor_tela: valorTela,
      desconto1, desconto2, desconto3,
      forma_pagamento: formaPagamento,
      parcelas,
      valor_entrada: valorEntrada,
      plus_percentual: plusPercentual,
      valor_final: result.valorFinal,
      valor_parcela: result.valorParcela,
      arquivo_url: arquivoUrl,
      arquivo_nome: arquivoNome,
    } as any);
    setSaving(false);
    if (error) toast.error("Erro ao salvar simulação");
    else {
      savedRef.current = true;
      sessionStorage.removeItem(SIM_STORAGE_KEY);
      toast.success("Simulação salva com sucesso!");

      // Audit: simulation saved
      const userInfo = getAuditUserInfo();
      logAudit({
        acao: "simulacao_salva",
        entidade: "simulation",
        entidade_id: clientId,
        detalhes: {
          valor_tela: valorTela,
          valor_final: result.valorFinal,
          forma_pagamento: formaPagamento,
          desconto1, desconto2, desconto3,
        },
        ...userInfo,
      });

      if (!client) {
        setShowClientForm(false);
        setNewClient({ nome: "", cpf: "", telefone1: "", telefone2: "", email: "", vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "" });
      }
    }
  };

  const [closingSale, setClosingSale] = useState(false);
  const [contractEditorOpen, setContractEditorOpen] = useState(false);
  const [contractHtml, setContractHtml] = useState("");
  const [pendingSimId, setPendingSimId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [closeSaleModalOpen, setCloseSaleModalOpen] = useState(false);
  const [closeSaleFormData, setCloseSaleFormData] = useState<any>(null);
  const [closeSaleItems, setCloseSaleItems] = useState<any[]>([]);
  const [closeSaleItemDetails, setCloseSaleItemDetails] = useState<any[]>([]);

  const handleCloseSale = async () => {
    if (!client) {
      toast.error("Selecione um cliente para fechar a venda");
      return;
    }

    // Deal Room access validation via backend
    try {
      const tenantId = resolvedTenantId;
      if (tenantId) {
        const accessResult = await validateAccess(tenantId, currentUser?.id);
        if (!accessResult.allowed) {
          // Show upgrade suggestion for basic plan
          if (accessResult.reason?.includes("Básico")) {
            toast.error(accessResult.reason, { duration: 6000 });
          } else {
            toast.error(accessResult.reason || "Acesso não permitido à Deal Room");
          }
          return;
        }
        if (accessResult.plano === "basico" && accessResult.usage !== undefined && accessResult.limit !== undefined) {
          toast.info(`Uso diário: ${accessResult.usage}/${accessResult.limit} negociação(ões) no plano Básico`, { duration: 4000 });
        }
      }
    } catch (err) {
      console.error("Deal Room validation error:", err);
    }

    setCloseSaleModalOpen(true);
  };

  const handleCloseSaleConfirm = async (formData: any, items: any[], itemDetails: any[]) => {
    if (!client) return;
    setCloseSaleFormData(formData);
    setCloseSaleItems(items);
    setCloseSaleItemDetails(itemDetails);
    setClosingSale(true);
    setCloseSaleModalOpen(false);

    try {
      // Save the simulation
      let arquivoUrl: string | null = null;
      let arquivoNome: string | null = null;
      if (importedFile) {
        const uploaded = await uploadFile(importedFile, client.id);
        if (uploaded) { arquivoUrl = uploaded.url; arquivoNome = uploaded.nome; }
      }

      const { data: simData, error: simError } = await supabase.from("simulations").insert({
        client_id: client.id, valor_tela: valorTela, desconto1, desconto2, desconto3,
        forma_pagamento: formaPagamento, parcelas, valor_entrada: valorEntrada,
        plus_percentual: plusPercentual, valor_final: result.valorFinal,
        valor_parcela: result.valorParcela, arquivo_url: arquivoUrl, arquivo_nome: arquivoNome,
      } as any).select("id").single();

      if (simError || !simData) { toast.error("Erro ao salvar simulação"); setClosingSale(false); return; }

      // Fetch active contract template
      const { data: template } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!template) {
        toast.error("Nenhum modelo de contrato ativo encontrado. Cadastre um em Configurações > Contratos.");
        setClosingSale(false);
        return;
      }

      // Fill template variables
      const dataAtual = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      const formaLabel = FORMAS_PAGAMENTO_LABELS;

      // Build items HTML table
      let itensHtml = "";
      if (items.length > 0) {
        itensHtml = `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#f0f0f0;"><th>Item</th><th>Qtd</th><th>Descrição/Ambiente</th><th>Fornecedor</th><th>Prazo</th><th>Valor</th></tr>
          ${items.map((it: any, i: number) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${it.quantidade}</td><td>${it.descricao_ambiente}</td><td>${it.fornecedor}</td><td>${it.prazo}</td><td style="text-align:right">${formatCurrency(it.valor_ambiente)}</td></tr>`).join("")}
          <tr style="font-weight:bold;"><td colspan="5" style="text-align:right">Total:</td><td style="text-align:right">${formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0))}</td></tr>
        </table>`;
      }

      // Build item details HTML
      let detalhesHtml = "";
      if (itemDetails.length > 0) {
        detalhesHtml = `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">
          <tr style="background:#f0f0f0;"><th>Item</th><th>Títulos</th><th>Corpo</th><th>Porta</th><th>Puxador</th><th>Complemento</th><th>Modelo</th></tr>
          ${itemDetails.map((d: any) => `<tr><td style="text-align:center">${d.item_num}</td><td>${d.titulos}</td><td>${d.corpo}</td><td>${d.porta}</td><td>${d.puxador}</td><td>${d.complemento}</td><td>${d.modelo}</td></tr>`).join("")}
        </table>`;
      }

      let html = (template as any).conteudo_html as string;
      const replacements: Record<string, string> = {
        "{{nome_cliente}}": formData.nome_completo || client.nome || "",
        "{{cpf_cliente}}": formData.cpf_cnpj || client.cpf || "",
        "{{rg_insc_estadual}}": formData.rg_insc_estadual || "",
        "{{telefone_cliente}}": formData.telefone || client.telefone1 || "",
        "{{email_cliente}}": formData.email || client.email || "",
        "{{numero_orcamento}}": client.numero_orcamento || "",
        "{{numero_contrato}}": formData.numero_contrato || "",
        "{{data_fechamento}}": formData.data_fechamento ? format(new Date(formData.data_fechamento + "T12:00:00"), "dd/MM/yyyy") : "",
        "{{responsavel_venda}}": formData.responsavel_venda || "",
        "{{data_nascimento}}": formData.data_nascimento ? format(new Date(formData.data_nascimento + "T12:00:00"), "dd/MM/yyyy") : "",
        "{{profissao}}": formData.profissao || "",
        "{{endereco}}": formData.endereco || "",
        "{{bairro}}": formData.bairro || "",
        "{{cidade}}": formData.cidade || "",
        "{{uf}}": formData.uf || "",
        "{{cep}}": formData.cep || "",
        "{{endereco_entrega}}": formData.endereco_entrega || "",
        "{{bairro_entrega}}": formData.bairro_entrega || "",
        "{{cidade_entrega}}": formData.cidade_entrega || "",
        "{{uf_entrega}}": formData.uf_entrega || "",
        "{{cep_entrega}}": formData.cep_entrega || "",
        "{{prazo_entrega}}": formData.prazo_entrega || "",
        "{{observacoes}}": formData.observacoes || "",
        "{{projetista}}": formData.responsavel_venda || client.vendedor || "",
        "{{valor_tela}}": formatCurrency(valorTela),
        "{{valor_final}}": formatCurrency(result.valorFinal),
        "{{forma_pagamento}}": formaLabel[formaPagamento] || formaPagamento,
        "{{parcelas}}": String(formData.qtd_parcelas || parcelas),
        "{{valor_parcela}}": formatCurrency(formData.valor_parcelas || result.valorParcela),
        "{{valor_entrada}}": formatCurrency(formData.valor_entrada || valorEntrada),
        "{{data_atual}}": dataAtual,
        "{{empresa_nome}}": settings.company_name || "INOVAMAD",
        "{{cnpj_loja}}": (settings as any).cnpj_loja || "",
        "{{endereco_loja}}": (settings as any).endereco_loja || "",
        "{{bairro_loja}}": (settings as any).bairro_loja || "",
        "{{cidade_loja}}": (settings as any).cidade_loja || "",
        "{{uf_loja}}": (settings as any).uf_loja || "",
        "{{cep_loja}}": (settings as any).cep_loja || "",
        "{{telefone_loja}}": (settings as any).telefone_loja || "",
        "{{email_loja}}": (settings as any).email_loja || "",
        "{{indicador_nome}}": selectedIndicador?.nome || "",
        "{{indicador_comissao}}": String(comissaoPercentual),
        "{{itens_tabela}}": itensHtml,
        "{{itens_detalhes}}": detalhesHtml,
        "{{total_ambientes}}": formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0)),
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      setPendingSimId(simData.id);
      setPendingTemplateId((template as any).id);
      setContractHtml(html);
      setContractEditorOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao fechar venda");
    }
    setClosingSale(false);
  };

  const handleContractConfirm = async (finalHtml: string) => {
    if (!client || !pendingSimId) return;
    setClosingSale(true);

    const { error: contractError } = await supabase.from("client_contracts").insert({
      client_id: client.id,
      simulation_id: pendingSimId,
      template_id: pendingTemplateId,
      conteudo_html: finalHtml,
    } as any);

    if (contractError) { toast.error("Erro ao salvar contrato"); setClosingSale(false); return; }

    // === AUTO-GENERATE COMMISSIONS ===
    try {
      await generateSaleCommissions();
    } catch (err) {
      console.error("Erro ao gerar comissões:", err);
    }

    // === RECORD DEAL ROOM TRANSACTION ===
    try {
      const tenantId = resolvedTenantId;
      if (tenantId) {
        await recordSale(tenantId, {
          valor_venda: result.valorFinal,
          client_id: client.id,
          usuario_id: currentUser?.id,
          simulation_id: pendingSimId,
          forma_pagamento: formaPagamento,
          numero_contrato: closeSaleFormData?.numero_contrato || "",
          nome_cliente: client.nome,
          nome_vendedor: currentUser?.nome_completo || currentUser?.apelido || "",
        });
      }
    } catch (err) {
      console.error("Erro ao registrar transação Deal Room:", err);
    }

    openContractPrintWindow(finalHtml, `Contrato - ${client.nome}`);

    // Audit: sale closed
    const userInfo = getAuditUserInfo();
    logAudit({
      acao: "venda_fechada",
      entidade: "contract",
      entidade_id: pendingSimId,
      detalhes: {
        cliente: client.nome,
        cliente_id: client.id,
        valor_final: result.valorFinal,
        forma_pagamento: formaPagamento,
      },
      ...userInfo,
    });

    toast.success("Venda fechada! Contrato gerado, comissões criadas e salvo.");
    setContractEditorOpen(false);
    setPendingSimId(null);
    setPendingTemplateId(null);
    setClosingSale(false);
  };

  const generateSaleCommissions = async () => {
    if (!client) return;

    // Calculate "valor à vista" = after all discounts, before financing
    const valorAVista = applyDiscounts(valorTelaComComissao, desconto1, desconto2, desconto3);

    const mesRef = format(new Date(), "yyyy-MM");
    const contratoNum = closeSaleFormData?.numero_contrato || client.numero_orcamento || "";
    const commissions: any[] = [];

    // 1. Indicador commission
    if (selectedIndicador && comissaoPercentual > 0) {
      commissions.push({
        usuario_id: null,
        indicador_id: selectedIndicador.id,
        mes_referencia: mesRef,
        valor_comissao: (valorAVista * comissaoPercentual) / 100,
        valor_base: valorAVista,
        cargo_referencia: "Indicador",
        contrato_numero: contratoNum,
        client_name: client.nome,
        observacao: `Indicador: ${selectedIndicador.nome} (${comissaoPercentual}%)`,
        status: "pendente",
      });
    }

    // 2. Fetch all cargos with commission > 0
    const { data: cargosData } = await supabase.from("cargos").select("id, nome, comissao_percentual");
    const cargosComComissao = (cargosData || []).filter((c: any) => Number(c.comissao_percentual) > 0);

    if (cargosComComissao.length > 0) {
      // Fetch all active users with their cargos
      const { data: usersData } = await supabase.from("usuarios").select("id, nome_completo, apelido, cargo_id, ativo").eq("ativo", true);
      const activeUsers = usersData || [];

      for (const cargo of cargosComComissao) {
        const cargoPercent = Number(cargo.comissao_percentual);
        const usersWithCargo = activeUsers.filter((u: any) => u.cargo_id === cargo.id);

        // Match vendedor specifically
        const vendedorName = (closeSaleFormData?.responsavel_venda || client.vendedor || "").toLowerCase().trim();
        const matchedVendedor = usersWithCargo.find((u: any) =>
          u.nome_completo.toLowerCase().includes(vendedorName) ||
          (u.apelido && u.apelido.toLowerCase().includes(vendedorName))
        );

        if (matchedVendedor) {
          // Specific user matched as vendedor for this cargo
          commissions.push({
            usuario_id: matchedVendedor.id,
            mes_referencia: mesRef,
            valor_comissao: (valorAVista * cargoPercent) / 100,
            valor_base: valorAVista,
            cargo_referencia: cargo.nome,
            contrato_numero: contratoNum,
            client_name: client.nome,
            observacao: `${cargo.nome}: ${matchedVendedor.apelido || matchedVendedor.nome_completo} (${cargoPercent}%)`,
            status: "pendente",
          });
        } else if (usersWithCargo.length === 1) {
          // Only one user with this cargo — auto-assign
          const u = usersWithCargo[0];
          commissions.push({
            usuario_id: u.id,
            mes_referencia: mesRef,
            valor_comissao: (valorAVista * cargoPercent) / 100,
            valor_base: valorAVista,
            cargo_referencia: cargo.nome,
            contrato_numero: contratoNum,
            client_name: client.nome,
            observacao: `${cargo.nome}: ${u.apelido || u.nome_completo} (${cargoPercent}%)`,
            status: "pendente",
          });
        } else if (usersWithCargo.length > 1) {
          // Multiple users — create one entry per user
          for (const u of usersWithCargo) {
            commissions.push({
              usuario_id: u.id,
              mes_referencia: mesRef,
              valor_comissao: (valorAVista * cargoPercent) / 100,
              valor_base: valorAVista,
              cargo_referencia: cargo.nome,
              contrato_numero: contratoNum,
              client_name: client.nome,
              observacao: `${cargo.nome}: ${u.apelido || u.nome_completo} (${cargoPercent}%)`,
              status: "pendente",
            });
          }
        }
      }
    }

    // Insert all commissions
    if (commissions.length > 0) {
      const { error } = await supabase.from("payroll_commissions").insert(commissions as any);
      if (error) {
        console.error("Erro ao inserir comissões:", error);
        toast.error("Erro ao gerar comissões automáticas");
      } else {
        toast.success(`${commissions.length} comissão(ões) gerada(s) automaticamente`);
      }
    }
  };

  const passwordDialogTitle = pendingUnlock === "desconto3" ? "Senha do Gerente" : "Senha do Administrador";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {client && onBack && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>← Voltar</Button>
          <span className="text-sm text-muted-foreground">
            Simulação para: <span className="font-medium text-foreground">{client.nome}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base">Parâmetros da Negociação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Valor de Tela</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={valorTela ? valorTela.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setValorTela(parseInt(raw || "0") / 100);
                    }}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Importar arquivo TXT ou XML"
                  onClick={handleFileImport}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 border rounded-md overflow-hidden">
                <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Ambientes Importados</span>
                  <span className="text-xs text-muted-foreground">{environments.length} arquivo(s)</span>
                </div>
                {environments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs py-1.5 h-auto">Ambiente</TableHead>
                        <TableHead className="text-xs py-1.5 h-auto text-center">Peças</TableHead>
                        <TableHead className="text-xs py-1.5 h-auto text-right">Valor</TableHead>
                        <TableHead className="text-xs py-1.5 h-auto text-center">Data</TableHead>
                        {canDeleteEnvironment && <TableHead className="text-xs py-1.5 h-auto w-8"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {environments.map((env) => (
                        <TableRow key={env.id} className="text-xs">
                          <TableCell className="py-1.5 font-medium">
                            <Input
                              value={env.environmentName}
                              onChange={(e) => setEnvironments((prev) => prev.map((item) => item.id === env.id ? { ...item, environmentName: e.target.value } : item))}
                              className="h-6 text-xs border-none bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                            />
                          </TableCell>
                          <TableCell className="py-1.5 text-center">{env.pieceCount || "—"}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{formatCurrency(env.totalValue)}</TableCell>
                          <TableCell className="py-1.5 text-center text-muted-foreground">
                            {format(env.importedAt, "dd/MM HH:mm")}
                          </TableCell>
                          {canDeleteEnvironment && (
                            <TableCell className="py-1.5 text-center">
                              <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => handleRemoveEnvironment(env.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {environments.length > 1 && (
                        <TableRow className="bg-primary/5 font-semibold text-xs">
                          <TableCell className="py-1.5">Total ({environments.length} ambientes)</TableCell>
                          <TableCell className="py-1.5 text-center">{environments.reduce((s, e) => s + e.pieceCount, 0) || "—"}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums text-primary">{formatCurrency(environments.reduce((s, e) => s + e.totalValue, 0))}</TableCell>
                          <TableCell className="py-1.5"></TableCell>
                          {canDeleteEnvironment && <TableCell className="py-1.5"></TableCell>}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center gap-1 py-4 text-muted-foreground">
                    <Upload className="h-5 w-5" />
                    <p className="text-xs">Nenhum ambiente importado</p>
                    <p className="text-[10px]">Clique no botão acima para importar arquivos TXT ou XML</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Indicador do Cliente</Label>
                {selectedIndicadorId && comissaoPercentual > 0 && canHideIndicador && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                    onClick={() => setHideIndicador(!hideIndicador)}
                    title={hideIndicador ? "Mostrar indicador" : "Ocultar indicador da tela"}
                  >
                    {hideIndicador ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {hideIndicador ? "Mostrar" : "Ocultar"}
                  </Button>
                )}
                {selectedIndicadorId && comissaoPercentual > 0 && !canHideIndicador && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" /> VIP
                  </span>
                )}
              </div>
              {!hideIndicador && (
                <Select value={selectedIndicadorId || "_none"} onValueChange={(v) => setSelectedIndicadorId(v === "_none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum (0%)</SelectItem>
                    {activeIndicadores.map((ind) => (
                      <SelectItem key={ind.id} value={ind.id}>
                        {ind.nome} ({ind.comissao_percentual}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!hideIndicador && comissaoPercentual > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Acréscimo de {comissaoPercentual}%: {formatCurrency(valorTela)} → {formatCurrency(valorTelaComComissao)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <Label className="mb-1 block">Desconto 1 (%)</Label>
                <Select value={String(desconto1)} onValueChange={(v) => setDesconto1(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getOptionsForField("desconto1").map((v) => (
                      <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Desconto 2 (%)</Label>
                <Select value={String(desconto2)} onValueChange={(v) => setDesconto2(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getOptionsForField("desconto2").map((v) => (
                      <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 flex items-center gap-1">
                  Desconto 3 (%)
                  {!desconto3Unlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {desconto3Unlocked && <LockOpen className="h-3 w-3 text-success" />}
                </Label>
                {desconto3Unlocked ? (
                  <Select value={String(desconto3)} onValueChange={(v) => setDesconto3(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getOptionsForField("desconto3").map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button variant="outline" size="sm" className="w-full h-9 gap-1 text-muted-foreground" onClick={() => requestUnlock("desconto3")}>
                    <Lock className="h-3 w-3" />Desbloquear
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={(v) => { setFormaPagamento(v as FormaPagamento); setParcelas(1); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formaPagamento === "Boleto" && boletoProviders.length > 0 && (
              <div>
                <Label>Financeira</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {boletoProviders.map((p) => (
                    <Button key={p} size="sm" variant={selectedBoletoProvider === p ? "default" : "outline"} onClick={() => { setSelectedBoletoProvider(p); setParcelas(1); }}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {(formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") && creditoProviders.length > 0 && (
              <div>
                <Label>Operadora de Crédito</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {creditoProviders.map((p) => (
                    <Button key={p} size="sm" variant={selectedCreditoProvider === p ? "default" : "outline"} onClick={() => { setSelectedCreditoProvider(p); setParcelas(1); }}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {showCarencia && (
              <div>
                <Label>Carência (dias)</Label>
                <Select value={String(carenciaDias)} onValueChange={(v) => setCarenciaDias(Number(v) as 30 | 60 | 90)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARENCIA_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showParcelas && (
              <div>
                <Label>Parcelas</Label>
                <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Valor de Entrada</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={valorEntrada ? valorEntrada.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setValorEntrada(parseInt(raw || "0") / 100);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            {showPlus && (
              <div>
                <Label className="flex items-center gap-1">
                  Desconto Plus (%)
                  {!plusUnlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {plusUnlocked && <LockOpen className="h-3 w-3 text-success" />}
                </Label>
                {plusUnlocked ? (
                  <Select value={String(plusPercentual)} onValueChange={(v) => setPlusPercentual(Number(v))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getOptionsForField("plus").map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button variant="outline" size="sm" className="mt-1 w-full gap-1 text-muted-foreground" onClick={() => requestUnlock("plus")}>
                    <Lock className="h-3 w-3" />Desbloquear
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <AIStrategyPanel
            valorTela={valorTela}
            valorTelaComComissao={valorTelaComComissao}
            discountOptions={{
              desconto1: getOptionsForField("desconto1"),
              desconto2: getOptionsForField("desconto2"),
              desconto3: getOptionsForField("desconto3"),
              plus: getOptionsForField("plus"),
            }}
            maxParcelas={maxParcelas}
            currentFormaPagamento={formaPagamento}
            onApplyStrategy={(s) => {
              setDesconto1(s.desconto1);
              setDesconto2(s.desconto2);
              setDesconto3(s.desconto3);
              setPlusPercentual(s.plusPercentual);
              setFormaPagamento(s.formaPagamento as any);
              setParcelas(s.parcelas);
              setValorEntrada(s.valorEntrada);
              if (s.desconto3 > 0) setDesconto3Unlocked(true);
              if (s.plusPercentual > 0) setPlusUnlocked(true);
            }}
            canAccess={(() => {
              const cargo = currentUser?.cargo_nome?.toUpperCase() || "";
              return cargo.includes("ADMIN") || cargo.includes("GERENTE") || cargo.includes("PROJETISTA");
            })()}
            historicalConversionRate={conversionStats.conversionRate}
          />
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base">Resultado</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ResultRow label="Valor de Tela" value={formatCurrency(valorTela)} />
              {!hideIndicador && comissaoPercentual > 0 && (
                <ResultRow label={`Indicador (${comissaoPercentual}%)`} value={`+ ${formatCurrency(valorTelaComComissao - valorTela)}`} muted />
              )}
              {!hideIndicador && comissaoPercentual > 0 && (
                <ResultRow label="Valor com Indicador" value={formatCurrency(valorTelaComComissao)} />
              )}
              <ResultRow label="Desconto Total" value={formatCurrency(valorTelaComComissao - result.valorComDesconto)} muted />
              <ResultRow label="Valor com Desconto" value={formatCurrency(result.valorComDesconto)} />
              <Separator />
              <ResultRow label="Entrada" value={formatCurrency(valorEntrada)} />
              <ResultRow label="Saldo" value={formatCurrency(result.saldo)} />
              {result.taxaCredito > 0 && <ResultRow label="Taxa de Crédito" value={formatPercent(result.taxaCredito * 100)} muted />}
              {result.taxaBoleto > 0 && <ResultRow label="Coeficiente Boleto" value={result.taxaBoleto.toFixed(6)} muted />}
              {result.taxaFixaBoleto > 0 && <ResultRow label="Taxa Fixa Boleto" value={formatCurrency(result.taxaFixaBoleto)} muted />}
              {showCarencia && <ResultRow label="Carência" value={`${carenciaDias} dias`} muted />}
              <Separator />
              <div className="bg-primary/5 -mx-6 px-6 py-4 rounded-md">
                <ResultRow label="Valor Final" value={formatCurrency(result.valorFinal)} highlight />
                {showParcelas && <ResultRow label={`Parcela (${parcelas}x)`} value={formatCurrency(result.valorParcela)} highlight />}
              </div>

              <div className="flex flex-col gap-3 mt-4">
                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-2">
                    <Save className="h-4 w-4" />
                    {saving ? "Salvando..." : "Salvar Simulação"}
                  </Button>
                  {client && (
                    <Button variant="outline" className="gap-2" onClick={() =>
                      generateSimulationPdf({
                        clientName: client.nome,
                        clientCpf: client.cpf || undefined,
                        clientEmail: client.email || undefined,
                        clientPhone: client.telefone1 || undefined,
                        vendedor: client.vendedor || undefined,
                        companyName: settings.company_name,
                        companySubtitle: settings.company_subtitle || undefined,
                        companyLogoUrl: settings.logo_url || undefined,
                        valorTela, desconto1, desconto2, desconto3,
                        valorComDesconto: result.valorComDesconto,
                        formaPagamento, parcelas, valorEntrada, plusPercentual,
                        taxaCredito: result.taxaCredito,
                        saldo: result.saldo, valorFinal: result.valorFinal, valorParcela: result.valorParcela,
                      })
                    }>
                      <FileDown className="h-4 w-4" />PDF
                    </Button>
                  )}
                </div>
                <Button
                  onClick={handleCloseSale}
                  disabled={closingSale}
                  className="w-full gap-2 bg-primary hover:bg-primary/90"
                >
                  <Handshake className="h-4 w-4" />
                  {closingSale ? "Gerando contrato..." : "Fechar Venda"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => {
                    setValorTela(0); setDesconto1(0); setDesconto2(0); setDesconto3(0);
                    setFormaPagamento("A vista"); setParcelas(1); setValorEntrada(0);
                    setPlusPercentual(0); setCarenciaDias(30); setSelectedIndicadorId("");
                    setDesconto3Unlocked(false); setPlusUnlocked(false);
                    setEnvironments([]); setImportedFile(null);
                    sessionStorage.removeItem(SIM_STORAGE_KEY);
                    toast.success("Simulação limpa");
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Limpar Simulação
                </Button>
                {!client && (
                  <p className="text-xs text-muted-foreground text-center">
                    Selecione um cliente para concluir a venda e gerar contrato.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Client creation form - shown when saving without a client */}
          {!client && showClientForm && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Cadastrar Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={newClient.nome} onChange={(e) => setNewClient(p => ({ ...p, nome: e.target.value }))} className="mt-1" placeholder="Nome completo" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{isCnpj(newClient.cpf) ? "CNPJ" : "CPF"}</Label>
                    <Input
                      value={newClient.cpf}
                      onChange={(e) => setNewClient(p => ({ ...p, cpf: maskCpfCnpj(e.target.value) }))}
                      className="mt-1"
                      placeholder={isCnpj(newClient.cpf) ? "00.000.000/0000-00" : "000.000.000-00"}
                    />
                    {newClient.cpf && !validateCpfCnpj(newClient.cpf).valid && (
                      <p className="text-xs text-destructive mt-1">{validateCpfCnpj(newClient.cpf).message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={newClient.email} onChange={(e) => setNewClient(p => ({ ...p, email: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Telefone 1</Label>
                    <Input
                      value={newClient.telefone1}
                      onChange={(e) => setNewClient(p => ({ ...p, telefone1: maskPhone(e.target.value) }))}
                      className="mt-1"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label>Telefone 2</Label>
                    <Input
                      value={newClient.telefone2}
                      onChange={(e) => setNewClient(p => ({ ...p, telefone2: maskPhone(e.target.value) }))}
                      className="mt-1"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                <div>
                  <Label>Projetista Responsável</Label>
                  <Select value={newClient.vendedor} onValueChange={(v) => setNewClient(p => ({ ...p, vendedor: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {projetistas.map((u) => (
                        <SelectItem key={u.id} value={u.apelido || u.nome_completo}>
                          {u.apelido || u.nome_completo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Indicador do Cliente</Label>
                  <Select value={newClient.indicador_id || "_none"} onValueChange={(v) => setNewClient(p => ({ ...p, indicador_id: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {activeIndicadores.map((ind) => (
                        <SelectItem key={ind.id} value={ind.id}>
                          {ind.nome} ({ind.comissao_percentual}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Qtd. Ambientes</Label>
                    <Input type="number" min={0} value={newClient.quantidade_ambientes} onChange={(e) => setNewClient(p => ({ ...p, quantidade_ambientes: Number(e.target.value) }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input value={newClient.descricao_ambientes} onChange={(e) => setNewClient(p => ({ ...p, descricao_ambientes: e.target.value }))} className="mt-1" placeholder="Ex: Cozinha, Quarto..." />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowClientForm(false)}>Cancelar</Button>
                  <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-1" onClick={handleSave} disabled={saving}>
                    <Save className="h-3 w-3" />
                    {saving ? "Salvando..." : "Cadastrar e Salvar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />{passwordDialogTitle}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Informe a senha para desbloquear</Label>
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="mt-1"
              placeholder="Senha"
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordConfirm(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handlePasswordConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CloseSaleModal
        open={closeSaleModalOpen}
        onClose={() => setCloseSaleModalOpen(false)}
        onConfirm={handleCloseSaleConfirm}
        client={client}
        simulationData={{
          valorFinal: result.valorFinal,
          valorEntrada,
          parcelas,
          valorParcela: result.valorParcela,
          formaPagamento,
          vendedor: client?.vendedor || "",
          numeroOrcamento: client?.numero_orcamento || "",
        }}
        saving={closingSale}
      />

      {client && (
        <ContractEditorDialog
          open={contractEditorOpen}
          onClose={() => { setContractEditorOpen(false); setPendingSimId(null); setPendingTemplateId(null); }}
          initialHtml={contractHtml}
          clientName={client.nome}
          onConfirm={handleContractConfirm}
          saving={closingSale}
        />
      )}
    </div>
  );
}

function ResultRow({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={muted ? "text-sm text-muted-foreground" : highlight ? "text-sm font-semibold text-foreground" : "text-sm text-foreground"}>{label}</span>
      <span className={highlight ? "text-lg font-bold text-primary tabular-nums" : muted ? "text-sm text-muted-foreground tabular-nums" : "text-sm font-medium text-foreground tabular-nums"}>{value}</span>
    </div>
  );
}
