import {useState, useMemo, useEffect, useRef} from "react";
import {UpgradePlanDialog, parsePlanLimitError} from "@/components/shared/UpgradePlanDialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Lock, LockOpen, Upload, EyeOff, Eye, FolderOpen} from "lucide-react";
import {LoadSimulationModal} from "@/components/simulator/LoadSimulationModal";
import {SimulatorEnvironmentsTable, type ImportedEnvironment} from "@/components/simulator/SimulatorEnvironmentsTable";
import {SimulatorResultCard} from "@/components/simulator/SimulatorResultCard";
import {SimulatorClientForm} from "@/components/simulator/SimulatorClientForm";
import {AIStrategyPanel} from "@/components/AIStrategyPanel";
import {useConversionHistory} from "@/hooks/useConversionHistory";

import {calculateSimulation, formatCurrency, type FormaPagamento, type SimulationInput, type BoletoRateData} from "@/lib/financing";
import {generateOrcamentoNumber, applyDiscounts} from "@/services/financialService";
import {parseProjectFile} from "@/services/fileImportService";
import {buildContractHtml} from "@/services/contractService";
import {generateSaleCommissions} from "@/services/commissionService";
import {validateFileUpload} from "@/lib/validation";
import {generateSimulationPdf} from "@/lib/generatePdf";
import {ContractEditorDialog} from "@/components/ContractEditorDialog";
import {CloseSaleModal} from "@/components/CloseSaleModal";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {useDealRoom} from "@/hooks/useDealRoom";
import {logAudit, getAuditUserInfo} from "@/services/auditService";
import {useFinancingRates} from "@/hooks/useFinancingRates";
import {useCurrentUser} from "@/hooks/useCurrentUser";
import {useCompanySettings} from "@/hooks/useCompanySettings";
import {useDiscountOptions} from "@/hooks/useDiscountOptions";
import {useUsuarios} from "@/hooks/useUsuarios";
import {useIndicadores} from "@/hooks/useIndicadores";
import {useTenantPlanContext} from "@/hooks/useTenantPlan";
import {getResolvedTenantId} from "@/contexts/TenantContext";
import {openContractPrintWindow} from "@/lib/contractDocument";
import type {Database} from "@/integrations/supabase/types";

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

export interface SavedEnvironmentData {
  id: string;
  fileName: string;
  environmentName: string;
  pieceCount: number;
  totalValue: number;
  importedAt: string;
  fileUrl?: string;
}

export interface SavedSimulationData {
  valor_tela: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  forma_pagamento: string;
  parcelas: number;
  valor_entrada: number;
  plus_percentual: number;
  ambientes?: SavedEnvironmentData[];
}

interface SimulatorPanelProps {
  client?: Client | null;
  onBack?: () => void;
  onClientCreated?: () => void;
  initialSimulation?: SavedSimulationData | null;
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

// ImportedEnvironment is now imported from SimulatorEnvironmentsTable

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

export function SimulatorPanel({ client, onBack, onClientCreated, initialSimulation }: SimulatorPanelProps) {
  // Only restore stored state if there's an active client context or stored data is fresh
  const stored = useMemo(() => {
    // If opening from a saved simulation, use that data instead of sessionStorage
    if (initialSimulation) return {};
    if (client) return loadStoredState();
    const s = loadStoredState();
    return s.valorTela ? s : {};
  }, []);

  // Pre-fill from saved simulation if provided
  const init = initialSimulation;

  const savedRef = useRef(false);

  const [valorTela, setValorTela] = useState(init?.valor_tela ?? stored.valorTela ?? 0);
  const [desconto1, setDesconto1] = useState(init?.desconto1 ?? stored.desconto1 ?? 0);
  const [desconto2, setDesconto2] = useState(init?.desconto2 ?? stored.desconto2 ?? 0);
  const [desconto3, setDesconto3] = useState(init?.desconto3 ?? stored.desconto3 ?? 0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>((init?.forma_pagamento as FormaPagamento) ?? stored.formaPagamento ?? "A vista");
  const [parcelas, setParcelas] = useState(init?.parcelas ?? stored.parcelas ?? 1);
  const [valorEntrada, setValorEntrada] = useState(init?.valor_entrada ?? stored.valorEntrada ?? 0);
  const [plusPercentual, setPlusPercentual] = useState(init?.plus_percentual ?? stored.plusPercentual ?? 0);
  const [carenciaDias, setCarenciaDias] = useState<30 | 60 | 90>(stored.carenciaDias ?? 30);
  const [saving, setSaving] = useState(false);
  const [desconto3Unlocked, setDesconto3Unlocked] = useState((init?.desconto3 ?? 0) > 0 || (stored.desconto3Unlocked ?? false));
  const [plusUnlocked, setPlusUnlocked] = useState((init?.plus_percentual ?? 0) > 0 || (stored.plusUnlocked ?? false));
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingUnlock, setPendingUnlock] = useState<"desconto3" | "plus" | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState("");
  const [loadSimModalOpen, setLoadSimModalOpen] = useState(false);

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
    // Restore from saved simulation (DB) if available
    if (init?.ambientes && init.ambientes.length > 0) {
      return init.ambientes.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        environmentName: e.environmentName,
        pieceCount: e.pieceCount,
        totalValue: e.totalValue,
        importedAt: new Date(e.importedAt),
        file: new File([], e.fileName), // placeholder — original file stored in cloud
      }));
    }
    // Restore from sessionStorage
    return (stored.environments || []).map((e) => ({
      ...e,
      importedAt: new Date(e.importedAt),
      file: new File([], e.fileName),
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

  const { rates: boletoRates, activeProviders: boletoProviders } = useFinancingRates("boleto");
  const { rates: creditoRates, activeProviders: creditoProviders } = useFinancingRates("credito");

  // Read per-provider defaults from company_settings
  const boletoDefaults = ((settings as any)?.boleto_defaults || {}) as Record<string, { parcelas: number; carencia: number }>;
  const creditoDefaults = ((settings as any)?.credito_defaults || {}) as Record<string, { parcelas: number }>;

  const [selectedBoletoProvider, setSelectedBoletoProvider] = useState("");
  const [selectedCreditoProvider, setSelectedCreditoProvider] = useState("");

  const currentBoletoRates = useMemo(() =>
    boletoRates.filter((r) => r.provider_name === selectedBoletoProvider),
    [boletoRates, selectedBoletoProvider]
  );
  const currentCreditoRates = useMemo(() =>
    creditoRates.filter((r) => r.provider_name === selectedCreditoProvider),
    [creditoRates, selectedCreditoProvider]
  );

  const availableBoletoInstallments = useMemo(() => {
    return [...new Set(currentBoletoRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
  }, [currentBoletoRates]);

  const availableCreditoInstallments = useMemo(() => {
    return [...new Set(currentCreditoRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
  }, [currentCreditoRates]);

  const availableParcelas = useMemo(() => {
    if (formaPagamento === "Boleto") return availableBoletoInstallments;
    if (formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") return availableCreditoInstallments;
    return [1];
  }, [formaPagamento, availableBoletoInstallments, availableCreditoInstallments]);

  const maxParcelas = useMemo(() => {
    return availableParcelas.length > 0 ? Math.max(...availableParcelas) : 1;
  }, [availableParcelas]);

  const getNearestAvailableInstallment = (target: number, options: number[]) => {
    if (!options.length) return 1;
    if (options.includes(target)) return target;
    return options.reduce(
      (closest, current) =>
        Math.abs(current - target) < Math.abs(closest - target) ? current : closest,
      options[0]
    );
  };

  const getAvailableCarenciaValues = (rates: typeof currentBoletoRates): Array<30 | 60 | 90> => {
    const values: Array<30 | 60 | 90> = [30];
    if (rates.some((r) => Number(r.coeficiente_60) > 0)) values.push(60);
    if (rates.some((r) => Number(r.coeficiente_90) > 0)) values.push(90);
    return values;
  };

  const availableCarenciaOptions = useMemo(() => {
    const allowed = new Set(getAvailableCarenciaValues(currentBoletoRates));
    return CARENCIA_OPTIONS.filter((c) => allowed.has(Number(c.value) as 30 | 60 | 90));
  }, [currentBoletoRates]);

  // Helper to apply boleto defaults for a provider
  const applyBoletoDefaults = (provider: string) => {
    const providerRates = boletoRates.filter((r) => r.provider_name === provider);
    const providerInstallments = [...new Set(providerRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
    const providerCarencias = getAvailableCarenciaValues(providerRates);
    const pd = boletoDefaults[provider];

    if (pd?.parcelas > 0) setParcelas(getNearestAvailableInstallment(pd.parcelas, providerInstallments));
    else if (providerInstallments.length > 0) setParcelas(providerInstallments[0]);

    if (pd && providerCarencias.includes(pd.carencia as 30 | 60 | 90)) {
      setCarenciaDias(pd.carencia as 30 | 60 | 90);
    } else {
      setCarenciaDias(providerCarencias[0] ?? 30);
    }
  };

  // Helper to apply credito defaults for a provider
  const applyCreditoDefaults = (provider: string) => {
    const providerRates = creditoRates.filter((r) => r.provider_name === provider);
    const providerInstallments = [...new Set(providerRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
    const pd = creditoDefaults[provider];

    if (pd?.parcelas > 0) setParcelas(getNearestAvailableInstallment(pd.parcelas, providerInstallments));
    else if (providerInstallments.length > 0) setParcelas(providerInstallments[0]);
  };

  // Set initial provider when providers load
  useEffect(() => {
    if (boletoProviders.length > 0 && !selectedBoletoProvider) {
      setSelectedBoletoProvider(boletoProviders[0]);
    }
  }, [boletoProviders, selectedBoletoProvider]);

  useEffect(() => {
    if (creditoProviders.length > 0 && !selectedCreditoProvider) {
      setSelectedCreditoProvider(creditoProviders[0]);
    }
  }, [creditoProviders, selectedCreditoProvider]);

  // Apply defaults when settings load and provider is already selected (handles async settings load)
  const boletoDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (boletoDefaultsAppliedRef.current) return;
    if (!selectedBoletoProvider) return;
    if (stored.parcelas || stored.carenciaDias) return;
    applyBoletoDefaults(selectedBoletoProvider);
    boletoDefaultsAppliedRef.current = true;
  }, [selectedBoletoProvider, boletoDefaults, boletoRates]);

  const creditoDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (creditoDefaultsAppliedRef.current) return;
    if (!selectedCreditoProvider) return;
    if (stored.parcelas) return;
    if (formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") {
      applyCreditoDefaults(selectedCreditoProvider);
      creditoDefaultsAppliedRef.current = true;
    }
  }, [selectedCreditoProvider, creditoDefaults, creditoRates, formaPagamento]);

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(formaPagamento);
  const showPlus = ["A vista", "Pix"].includes(formaPagamento);
  const showCarencia = ["Boleto", "Credito / Boleto"].includes(formaPagamento);

  // Keep selected installment valid for the current provider/payment method
  useEffect(() => {
    if (!showParcelas || availableParcelas.length === 0) return;
    const nextParcela = getNearestAvailableInstallment(parcelas, availableParcelas);
    if (nextParcela !== parcelas) setParcelas(nextParcela);
  }, [showParcelas, availableParcelas, parcelas]);

  // Keep selected grace period valid for the current boleto provider
  useEffect(() => {
    if (!showCarencia || availableCarenciaOptions.length === 0) return;
    const currentIsValid = availableCarenciaOptions.some((option) => Number(option.value) === carenciaDias);
    if (!currentIsValid) {
      setCarenciaDias(Number(availableCarenciaOptions[0].value) as 30 | 60 | 90);
    }
  }, [showCarencia, availableCarenciaOptions, carenciaDias]);

  // When user manually changes boleto provider, ALWAYS apply its defaults
  const handleBoletoProviderChange = (provider: string) => {
    setSelectedBoletoProvider(provider);
    applyBoletoDefaults(provider);
  };

  // When user manually changes credito provider, ALWAYS apply its defaults
  const handleCreditoProviderChange = (provider: string) => {
    setSelectedCreditoProvider(provider);
    applyCreditoDefaults(provider);
  };


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

          const parsed = parseProjectFile(content, file.name);

          if (parsed.total && !isNaN(parsed.total)) {
            const newEnv: ImportedEnvironment = {
              id: crypto.randomUUID(),
              fileName: file.name,
              environmentName: parsed.envName,
              pieceCount: parsed.pieces,
              totalValue: parsed.total,
              importedAt: new Date(),
              file,
            };
            setEnvironments((prev) => [...prev, newEnv]);
            setImportedFile(file);
            toast.success(`Ambiente "${parsed.envName}" importado: ${formatCurrency(parsed.total)}`);
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

    // Upload all environment files to storage
    const uploadedEnvironments: SavedEnvironmentData[] = [];
    for (const env of environments) {
      let fileUrl: string | undefined;
      if (env.file && env.file.size > 0) {
        const uploaded = await uploadFile(env.file, clientId);
        if (uploaded) fileUrl = uploaded.url;
      }
      uploadedEnvironments.push({
        id: env.id,
        fileName: env.fileName,
        environmentName: env.environmentName,
        pieceCount: env.pieceCount,
        totalValue: env.totalValue,
        importedAt: env.importedAt.toISOString(),
        fileUrl,
      });
    }

    // Store environments as JSON in arquivo_nome/arquivo_url
    const arquivoNome = uploadedEnvironments.length > 0 ? JSON.stringify(uploadedEnvironments) : null;
    const arquivoUrl = uploadedEnvironments.length > 0 ? uploadedEnvironments.map(e => e.fileUrl).filter(Boolean).join(',') : null;

    // Limit to 3 simulations per client — delete oldest if needed
    const { data: existingSims } = await supabase
      .from("simulations")
      .select("id, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (existingSims && existingSims.length >= 3) {
      const idsToDelete = existingSims.slice(2).map((s) => s.id);
      await supabase.from("simulations").delete().in("id", idsToDelete);
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
      tenant_id: resolvedTenantId,
    } as any);
    setSaving(false);
    if (error) {
      const limitMsg = parsePlanLimitError(error.message || "");
      if (limitMsg) { setUpgradeMsg(limitMsg); setUpgradeOpen(true); }
      else toast.error("Erro ao salvar simulação");
    }
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
        const accessResult = await validateAccess(tenantId);
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
      // Upload all environment files
      const uploadedEnvs: SavedEnvironmentData[] = [];
      for (const env of environments) {
        let fileUrl: string | undefined;
        if (env.file && env.file.size > 0) {
          const uploaded = await uploadFile(env.file, client.id);
          if (uploaded) fileUrl = uploaded.url;
        }
        uploadedEnvs.push({
          id: env.id, fileName: env.fileName, environmentName: env.environmentName,
          pieceCount: env.pieceCount, totalValue: env.totalValue,
          importedAt: env.importedAt.toISOString(), fileUrl,
        });
      }
      const arquivoNome = uploadedEnvs.length > 0 ? JSON.stringify(uploadedEnvs) : null;
      const arquivoUrl = uploadedEnvs.length > 0 ? uploadedEnvs.map(e => e.fileUrl).filter(Boolean).join(',') : null;

      const { data: simData, error: simError } = await supabase.from("simulations").insert({
        client_id: client.id, valor_tela: valorTela, desconto1, desconto2, desconto3,
        forma_pagamento: formaPagamento, parcelas, valor_entrada: valorEntrada,
        plus_percentual: plusPercentual, valor_final: result.valorFinal,
        valor_parcela: result.valorParcela, arquivo_url: arquivoUrl, arquivo_nome: arquivoNome,
        tenant_id: resolvedTenantId,
      } as any).select("id").single();

      if (simError || !simData) {
        const limitMsg = parsePlanLimitError(simError?.message || "");
        if (limitMsg) { setUpgradeMsg(limitMsg); setUpgradeOpen(true); }
        else toast.error("Erro ao salvar simulação");
        setClosingSale(false); return;
      }

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

      // Fill template using contract service
      const html = buildContractHtml((template as any).conteudo_html, {
        formData, client, valorTela, result, formaPagamento, parcelas, valorEntrada,
        settings, selectedIndicador, comissaoPercentual, items, itemDetails,
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
      const valorAVista = applyDiscounts(valorTelaComComissao, desconto1, desconto2, desconto3);
      const commResult = await generateSaleCommissions({
        clientId: client.id,
        clientName: client.nome,
        valorAVista,
        contratoNumero: closeSaleFormData?.numero_contrato || client.numero_orcamento || "",
        responsavelVenda: closeSaleFormData?.responsavel_venda || client.vendedor || "",
        selectedIndicador,
        comissaoPercentual,
      });
      if (commResult.error) toast.error(commResult.error);
      else if (commResult.count > 0) toast.success(`${commResult.count} comissão(ões) gerada(s) automaticamente`);
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

    const userInfo = getAuditUserInfo();
    logAudit({
      acao: "venda_fechada",
      entidade: "contract",
      entidade_id: pendingSimId,
      detalhes: { cliente: client.nome, cliente_id: client.id, valor_final: result.valorFinal, forma_pagamento: formaPagamento },
      ...userInfo,
    });

    toast.success("Venda fechada! Contrato gerado, comissões criadas e salvo.");
    setContractEditorOpen(false);
    setPendingSimId(null);
    setPendingTemplateId(null);
    setClosingSale(false);
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
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Parâmetros da Negociação</CardTitle>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setLoadSimModalOpen(true)}>
                <FolderOpen className="h-3.5 w-3.5" /> Carregar Simulação
              </Button>
            </div>
          </CardHeader>
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
                <SimulatorEnvironmentsTable
                  environments={environments}
                  onUpdateName={(id, name) => setEnvironments((prev) => prev.map((item) => item.id === id ? { ...item, environmentName: name } : item))}
                  onRemove={handleRemoveEnvironment}
                  canDelete={canDeleteEnvironment}
                />
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
                    <Button key={p} size="sm" variant={selectedBoletoProvider === p ? "default" : "outline"} onClick={() => handleBoletoProviderChange(p)}>
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
                    <Button key={p} size="sm" variant={selectedCreditoProvider === p ? "default" : "outline"} onClick={() => handleCreditoProviderChange(p)}>
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
                    {availableCarenciaOptions.map((c) => (
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
                  <SelectContent className="max-h-60">
                    {availableParcelas.map((n) => (
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
          <SimulatorResultCard
            valorTela={valorTela}
            valorTelaComComissao={valorTelaComComissao}
            comissaoPercentual={comissaoPercentual}
            hideIndicador={hideIndicador}
            result={result}
            valorEntrada={valorEntrada}
            parcelas={parcelas}
            showParcelas={showParcelas}
            showCarencia={showCarencia}
            carenciaDias={carenciaDias}
            saving={saving}
            closingSale={closingSale}
            hasClient={!!client}
            onSave={handleSave}
            onPdf={client ? () => generateSimulationPdf({
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
            }) : null}
            onCloseSale={handleCloseSale}
            onClear={() => {
              setValorTela(0); setDesconto1(0); setDesconto2(0); setDesconto3(0);
              setFormaPagamento("A vista"); setParcelas(1); setValorEntrada(0);
              setPlusPercentual(0); setCarenciaDias(30); setSelectedIndicadorId("");
              setDesconto3Unlocked(false); setPlusUnlocked(false);
              setEnvironments([]); setImportedFile(null);
              sessionStorage.removeItem(SIM_STORAGE_KEY);
              toast.success("Simulação limpa");
            }}
          />

          {!client && showClientForm && (
            <SimulatorClientForm
              newClient={newClient}
              onChange={setNewClient}
              onCancel={() => setShowClientForm(false)}
              onSave={handleSave}
              saving={saving}
              projetistas={projetistas}
              indicadores={activeIndicadores}
            />
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
      <UpgradePlanDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} message={upgradeMsg} />
      <LoadSimulationModal
        open={loadSimModalOpen}
        onClose={() => setLoadSimModalOpen(false)}
        onSelect={(sim) => {
          setValorTela(sim.valor_tela);
          setDesconto1(sim.desconto1);
          setDesconto2(sim.desconto2);
          setDesconto3(sim.desconto3);
          setFormaPagamento(sim.forma_pagamento as FormaPagamento);
          setParcelas(sim.parcelas);
          setValorEntrada(sim.valor_entrada);
          setPlusPercentual(sim.plus_percentual);
          if (sim.desconto3 > 0) setDesconto3Unlocked(true);
          if (sim.plus_percentual > 0) setPlusUnlocked(true);
          // Restore environments if available
          if (sim.arquivo_nome) {
            try {
              const envs = JSON.parse(sim.arquivo_nome);
              if (Array.isArray(envs) && envs.length > 0) {
                setEnvironments(envs.map((e: any) => ({
                  id: e.id || crypto.randomUUID(),
                  fileName: e.fileName || e.name || "",
                  environmentName: e.environmentName || e.name || "",
                  pieceCount: e.pieceCount || 0,
                  totalValue: e.totalValue || Number(e.value) || 0,
                  importedAt: new Date(e.importedAt || Date.now()),
                  file: new File([], e.fileName || ""),
                })));
              }
            } catch {}
          }
          toast.success(`Simulação de ${sim.client_name} carregada!`);
        }}
      />
    </div>
  );
}
