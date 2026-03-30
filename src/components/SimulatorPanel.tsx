import {useState, useMemo, useEffect, useRef, useCallback} from "react";
import {parsePlanLimitError} from "@/components/shared/UpgradePlanDialog";
import {Button} from "@/components/ui/button";
import {SimulatorParametersForm} from "@/components/simulator/SimulatorParametersForm";
import {SimulatorClientPicker, LinkedClientBadge} from "@/components/simulator/SimulatorClientPicker";
import {SimulatorDialogs} from "@/components/simulator/SimulatorDialogs";
import type {ImportedEnvironment} from "@/components/simulator/SimulatorEnvironmentsTable";
import {SimulatorResultCard} from "@/components/simulator/SimulatorResultCard";
import {SimulatorClientForm} from "@/components/simulator/SimulatorClientForm";
import {AIStrategyPanel} from "@/components/AIStrategyPanel";
import {DeliveryStatusPanel} from "@/components/simulator/DeliveryStatusPanel";
import {useConversionHistory} from "@/hooks/useConversionHistory";

import {calculateSimulation, formatCurrency, type FormaPagamento, type SimulationInput, type BoletoRateData} from "@/lib/financing";
import {generateOrcamentoNumber, applyDiscounts} from "@/services/financialService";
import {parseProjectFile} from "@/services/fileImportService";
import {buildContractHtml} from "@/services/contractService";
import {generateSaleCommissions} from "@/services/commissionService";
import {validateFileUpload} from "@/lib/validation";
import {generateAndOpenBudgetPdf} from "@/lib/pdfService";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {useDealRoom} from "@/hooks/useDealRoom";
import {logAudit, getAuditUserInfo} from "@/services/auditService";
import {useFinancingRates} from "@/hooks/useFinancingRates";
import {useCurrentUser} from "@/hooks/useCurrentUser";
import {useCompanySettings} from "@/hooks/useCompanySettings";
import {useDiscountOptions} from "@/hooks/useDiscountOptions";
import {useUsuarios} from "@/hooks/useUsuarios";
import {useDiscountApproval} from "@/hooks/useDiscountApproval";
import {useIndicadores} from "@/hooks/useIndicadores";
import {useTenantPlanContext} from "@/hooks/useTenantPlan";
import {getResolvedTenantId} from "@/contexts/TenantContext";
import {openContractPrintWindow} from "@/lib/contractDocument";
import type {Database} from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export interface SavedEnvironmentData {
  id: string; fileName: string; environmentName: string;
  pieceCount: number; totalValue: number; importedAt: string; fileUrl?: string;
}

export interface SavedSimulationData {
  valor_tela: number; desconto1: number; desconto2: number; desconto3: number;
  forma_pagamento: string; parcelas: number; valor_entrada: number;
  plus_percentual: number; ambientes?: SavedEnvironmentData[];
}

interface SimulatorPanelProps {
  client?: Client | null;
  onBack?: () => void;
  onClientCreated?: () => void;
  initialSimulation?: SavedSimulationData | null;
}

const SIM_STORAGE_KEY = "simulator_state";

const CARENCIA_OPTIONS: { value: "30" | "60" | "90"; label: string }[] = [
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

interface SimulatorStoredState {
  valorTela: number; desconto1: number; desconto2: number; desconto3: number;
  formaPagamento: FormaPagamento; parcelas: number; valorEntrada: number;
  plusPercentual: number; carenciaDias: 30 | 60 | 90; selectedIndicadorId: string;
  desconto3Unlocked: boolean; plusUnlocked: boolean;
  environments: Array<{ id: string; fileName: string; environmentName: string; pieceCount: number; totalValue: number; importedAt: string }>;
}

function loadStoredState(): Partial<SimulatorStoredState> {
  try {
    const raw = sessionStorage.getItem(SIM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function getNearestAvailableInstallment(target: number, options: number[]) {
  if (!options.length) return 1;
  if (options.includes(target)) return target;
  return options.reduce((closest, current) =>
    Math.abs(current - target) < Math.abs(closest - target) ? current : closest, options[0]);
}

function getAvailableCarenciaValues(rates: Array<{ coeficiente_60?: any; coeficiente_90?: any }>): Array<30 | 60 | 90> {
  const values: Array<30 | 60 | 90> = [30];
  if (rates.some((r) => Number(r.coeficiente_60) > 0)) values.push(60);
  if (rates.some((r) => Number(r.coeficiente_90) > 0)) values.push(90);
  return values;
}

export function SimulatorPanel({ client, onBack, onClientCreated, initialSimulation }: SimulatorPanelProps) {
  const stored = useMemo(() => {
    if (initialSimulation) return {};
    if (client) return loadStoredState();
    const s = loadStoredState();
    return s.valorTela ? s : {};
  }, []);

  const init = initialSimulation;
  const savedRef = useRef(false);
  const VALOR_TELA_MAX = 50_000_000;
  const VALOR_ENTRADA_MAX = 50_000_000;

  // ─── Core State ───
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
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [catalogProductsTotal, setCatalogProductsTotal] = useState(0);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ─── Client State ───
  const [linkedClient, setLinkedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const effectiveClient = client || linkedClient;

  const searchClients = useCallback(async (term: string) => {
    if (!term || term.length < 2) { setClientResults([]); return; }
    const tid = await getResolvedTenantId();
    if (!tid) return;
    setSearchingClients(true);
    const { data } = await supabase.from("clients").select("*").eq("tenant_id", tid).ilike("nome", `%${term}%`).limit(5);
    setClientResults((data as Client[]) || []);
    setSearchingClients(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchClients(clientSearch), 300);
    return () => clearTimeout(t);
  }, [clientSearch, searchClients]);

  // ─── File / Environment State ───
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [selectedIndicadorId, setSelectedIndicadorId] = useState(stored.selectedIndicadorId ?? client?.indicador_id ?? "");
  const [hideIndicador, setHideIndicador] = useState(false);
  const [detectedSoftware, setDetectedSoftware] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<ImportedEnvironment[]>(() => {
    if (init?.ambientes && init.ambientes.length > 0) {
      return init.ambientes.map((e) => ({
        id: e.id, fileName: e.fileName, environmentName: e.environmentName,
        pieceCount: e.pieceCount, totalValue: e.totalValue,
        importedAt: new Date(e.importedAt), file: new File([], e.fileName),
      }));
    }
    return (stored.environments || []).map((e) => ({ ...e, importedAt: new Date(e.importedAt), file: new File([], e.fileName) }));
  });

  // ─── Hooks ───
  const { settings } = useCompanySettings();
  const { hasPermission, currentUser } = useCurrentUser();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  useEffect(() => { getResolvedTenantId().then(setResolvedTenantId); }, []);
  const { getOptionsForField } = useDiscountOptions();
  const { projetistas } = useUsuarios();
  const { activeIndicadores } = useIndicadores();
  const { isFeatureAllowed } = useTenantPlanContext();
  const canHideIndicador = isFeatureAllowed("ocultar_indicador");
  const { validateAccess, recordSale } = useDealRoom();
  const conversionStats = useConversionHistory((settings as any)?.tenant_id || null);
  const { loadRules: loadDiscountRules, checkDiscount, requestApproval } = useDiscountApproval();

  useEffect(() => { loadDiscountRules(); }, [loadDiscountRules]);

  const selectedIndicador = activeIndicadores.find(i => i.id === selectedIndicadorId);
  const comissaoPercentual = selectedIndicador ? selectedIndicador.comissao_percentual : 0;
  const valorTelaComComissao = valorTela * (1 + comissaoPercentual / 100);

  // ─── Rates ───
  const { rates: boletoRates, activeProviders: boletoProviders } = useFinancingRates("boleto");
  const { rates: creditoRates, activeProviders: creditoProviders } = useFinancingRates("credito");
  const boletoDefaults = ((settings as any)?.boleto_defaults || {}) as Record<string, { parcelas: number; carencia: number }>;
  const creditoDefaults = ((settings as any)?.credito_defaults || {}) as Record<string, { parcelas: number }>;

  const [selectedBoletoProvider, setSelectedBoletoProvider] = useState("");
  const [selectedCreditoProvider, setSelectedCreditoProvider] = useState("");

  const currentBoletoRates = useMemo(() => boletoRates.filter((r) => r.provider_name === selectedBoletoProvider), [boletoRates, selectedBoletoProvider]);
  const currentCreditoRates = useMemo(() => creditoRates.filter((r) => r.provider_name === selectedCreditoProvider), [creditoRates, selectedCreditoProvider]);

  const availableBoletoInstallments = useMemo(() => [...new Set(currentBoletoRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b), [currentBoletoRates]);
  const availableCreditoInstallments = useMemo(() => [...new Set(currentCreditoRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b), [currentCreditoRates]);

  const availableParcelas = useMemo(() => {
    if (formaPagamento === "Boleto") return availableBoletoInstallments;
    if (formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") return availableCreditoInstallments;
    return [1];
  }, [formaPagamento, availableBoletoInstallments, availableCreditoInstallments]);

  const maxParcelas = useMemo(() => availableParcelas.length > 0 ? Math.max(...availableParcelas) : 1, [availableParcelas]);

  const availableCarenciaOptions = useMemo(() => {
    const allowed = new Set(getAvailableCarenciaValues(currentBoletoRates));
    return CARENCIA_OPTIONS.filter((c) => allowed.has(Number(c.value) as 30 | 60 | 90));
  }, [currentBoletoRates]);

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(formaPagamento);
  const showPlus = ["A vista", "Pix"].includes(formaPagamento);
  const showCarencia = ["Boleto", "Credito / Boleto"].includes(formaPagamento);

  // ─── Provider Defaults ───
  const applyBoletoDefaults = useCallback((provider: string) => {
    const providerRates = boletoRates.filter((r) => r.provider_name === provider);
    const providerInstallments = [...new Set(providerRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
    const providerCarencias = getAvailableCarenciaValues(providerRates);
    const pd = boletoDefaults[provider];
    if (pd?.parcelas > 0) setParcelas(getNearestAvailableInstallment(pd.parcelas, providerInstallments));
    else if (providerInstallments.length > 0) setParcelas(providerInstallments[0]);
    if (pd && providerCarencias.includes(pd.carencia as 30 | 60 | 90)) setCarenciaDias(pd.carencia as 30 | 60 | 90);
    else setCarenciaDias(providerCarencias[0] ?? 30);
  }, [boletoRates, boletoDefaults]);

  const applyCreditoDefaults = useCallback((provider: string) => {
    const providerRates = creditoRates.filter((r) => r.provider_name === provider);
    const providerInstallments = [...new Set(providerRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
    const pd = creditoDefaults[provider];
    if (pd?.parcelas > 0) setParcelas(getNearestAvailableInstallment(pd.parcelas, providerInstallments));
    else if (providerInstallments.length > 0) setParcelas(providerInstallments[0]);
  }, [creditoRates, creditoDefaults]);

  // ─── Effects: Sync providers, defaults, installments, carencia ───
  useEffect(() => { if (boletoProviders.length > 0 && !selectedBoletoProvider) setSelectedBoletoProvider(boletoProviders[0]); }, [boletoProviders, selectedBoletoProvider]);
  useEffect(() => { if (creditoProviders.length > 0 && !selectedCreditoProvider) setSelectedCreditoProvider(creditoProviders[0]); }, [creditoProviders, selectedCreditoProvider]);

  const boletoDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (boletoDefaultsAppliedRef.current || !selectedBoletoProvider || stored.parcelas || stored.carenciaDias) return;
    applyBoletoDefaults(selectedBoletoProvider);
    boletoDefaultsAppliedRef.current = true;
  }, [selectedBoletoProvider, applyBoletoDefaults]);

  const creditoDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (creditoDefaultsAppliedRef.current || !selectedCreditoProvider || stored.parcelas) return;
    if (formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") {
      applyCreditoDefaults(selectedCreditoProvider);
      creditoDefaultsAppliedRef.current = true;
    }
  }, [selectedCreditoProvider, applyCreditoDefaults, formaPagamento]);

  useEffect(() => {
    if (!showParcelas || availableParcelas.length === 0) return;
    const next = getNearestAvailableInstallment(parcelas, availableParcelas);
    if (next !== parcelas) setParcelas(next);
  }, [showParcelas, availableParcelas, parcelas]);

  useEffect(() => {
    if (!showCarencia || availableCarenciaOptions.length === 0) return;
    if (!availableCarenciaOptions.some((o) => Number(o.value) === carenciaDias))
      setCarenciaDias(Number(availableCarenciaOptions[0].value) as 30 | 60 | 90);
  }, [showCarencia, availableCarenciaOptions, carenciaDias]);

  useEffect(() => { if (client?.indicador_id) setSelectedIndicadorId(client.indicador_id); }, [client?.id, client?.indicador_id]);

  // Auto-prefill from 3D Smart Import
  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem("simulator_prefill");
      if (!prefill) return;
      const data = JSON.parse(prefill);
      if (data.ambiente && data.valor) {
        setEnvironments(prev => {
          if (prev.some(e => e.environmentName === data.ambiente)) return prev;
          return [...prev, {
            id: crypto.randomUUID(), fileName: "3D Smart Import", environmentName: data.ambiente,
            pieceCount: data.pecas || 1, totalValue: data.valor, importedAt: new Date(),
            file: new File([""], "3d-import.json", { type: "application/json" }),
          } as ImportedEnvironment];
        });
        sessionStorage.removeItem("simulator_prefill");
      }
    } catch {}
  }, []);

  // Persist to sessionStorage
  useEffect(() => {
    const state: SimulatorStoredState = {
      valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada,
      plusPercentual, carenciaDias, selectedIndicadorId, desconto3Unlocked, plusUnlocked,
      environments: environments.map(({ file, importedAt, ...rest }) => ({ ...rest, importedAt: importedAt.toISOString() })),
    };
    sessionStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(state));
  }, [valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, carenciaDias, selectedIndicadorId, desconto3Unlocked, plusUnlocked, environments]);

  useEffect(() => { return () => { if (!savedRef.current) sessionStorage.removeItem(SIM_STORAGE_KEY); }; }, []);

  // Update valorTela from environments
  useEffect(() => {
    if (environments.length > 0 || catalogProductsTotal > 0) {
      setValorTela(environments.reduce((acc, env) => acc + env.totalValue, 0) + catalogProductsTotal);
    }
  }, [environments, catalogProductsTotal]);

  // ─── Rate Coefficients ───
  const { boletoCoeffMap, boletoRatesFullMap } = useMemo(() => {
    const coeffMap: Record<number, number> = {};
    const fullMap: Record<number, BoletoRateData> = {};
    currentBoletoRates.forEach((r) => {
      coeffMap[r.installments] = Number(r.coefficient);
      fullMap[r.installments] = { coefficient: Number(r.coefficient), taxa_fixa: Number(r.taxa_fixa), coeficiente_60: Number(r.coeficiente_60), coeficiente_90: Number(r.coeficiente_90) };
    });
    return { boletoCoeffMap: coeffMap, boletoRatesFullMap: fullMap };
  }, [currentBoletoRates]);

  const { creditoCoeffMap, creditoRatesFullMap } = useMemo(() => {
    const coeffMap: Record<number, number> = {};
    const fullMap: Record<number, { coefficient: number; taxa_fixa: number }> = {};
    currentCreditoRates.forEach((r) => {
      coeffMap[r.installments] = Number(r.coefficient);
      fullMap[r.installments] = { coefficient: Number(r.coefficient), taxa_fixa: Number(r.taxa_fixa) };
    });
    return { creditoCoeffMap: coeffMap, creditoRatesFullMap: fullMap };
  }, [currentCreditoRates]);

  const result = useMemo(() => {
    const input: SimulationInput = {
      valorTela: valorTelaComComissao, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
      creditRates: creditoCoeffMap, creditRatesFull: creditoRatesFullMap,
      boletoRates: boletoCoeffMap, boletoRatesFull: boletoRatesFullMap, carenciaDias,
    };
    return calculateSimulation(input);
  }, [valorTelaComComissao, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, boletoCoeffMap, boletoRatesFullMap, creditoCoeffMap, creditoRatesFullMap, carenciaDias]);

  // ─── Handlers ───
  const requestUnlock = (field: "desconto3" | "plus") => {
    if (field === "desconto3" && hasPermission("desconto3")) { setDesconto3Unlocked(true); return; }
    if (field === "plus" && hasPermission("plus")) { setPlusUnlocked(true); return; }
    const requiredPassword = field === "desconto3" ? settings.manager_password : settings.admin_password;
    if (!requiredPassword) { if (field === "desconto3") setDesconto3Unlocked(true); else setPlusUnlocked(true); return; }
    setPendingUnlock(field); setPasswordInput(""); setPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = () => {
    const requiredPassword = pendingUnlock === "desconto3" ? settings.manager_password : settings.admin_password;
    if (passwordInput === requiredPassword) {
      if (pendingUnlock === "desconto3") setDesconto3Unlocked(true);
      else if (pendingUnlock === "plus") setPlusUnlocked(true);
      setPasswordDialogOpen(false);
      toast.success("Acesso liberado!");
      const userInfo = getAuditUserInfo();
      logAudit({ acao: pendingUnlock === "desconto3" ? "desconto_desbloqueado" : "plus_desbloqueado", entidade: "security", detalhes: { campo: pendingUnlock, cliente: client?.nome }, ...userInfo });
    } else { toast.error("Senha incorreta"); }
    setPasswordInput("");
  };

  const handleFileImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".txt,.xml"; input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach((file) => {
        const fileValidation = validateFileUpload(file);
        if (!fileValidation.valid) { toast.error(fileValidation.message || "Arquivo inválido"); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          if (!content) return;
          const parsed = parseProjectFile(content, file.name);
          if (parsed.total && !isNaN(parsed.total)) {
            setEnvironments((prev) => [...prev, {
              id: crypto.randomUUID(), fileName: file.name, environmentName: parsed.envName,
              pieceCount: parsed.pieces, totalValue: parsed.total, importedAt: new Date(), file,
              fornecedor: parsed.fornecedor || "", corpo: parsed.corpo || "", porta: parsed.porta || "",
              puxador: parsed.puxador || "", complemento: parsed.complemento || "", modelo: parsed.modelo || "",
            } as any]);
            setImportedFile(file);
            if (parsed.software && parsed.software !== "generico") setDetectedSoftware(parsed.software);
            toast.success(`Ambiente "${parsed.envName}" importado: ${formatCurrency(parsed.total)}`);
          } else { toast.error(`Não foi possível encontrar o valor total em ${file.name}`); }
        };
        reader.readAsText(file);
      });
    };
    input.click();
  };

  const handleRemoveEnvironment = (envId: string) => {
    setEnvironments((prev) => {
      const updated = prev.filter((e) => e.id !== envId);
      if (updated.length === 0) { setValorTela(0); setImportedFile(null); }
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

  // ─── New Client Form ───
  const [showClientForm, setShowClientForm] = useState(false);
  const [newClient, setNewClient] = useState({
    nome: "", cpf: "", telefone1: "", telefone2: "", email: "",
    vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "",
  });

  // ─── Save Handler ───
  const handleSave = async () => {
    if (valorTela <= 0) { toast.error("Informe um Valor de Tela maior que zero"); return; }
    if (valorTela > VALOR_TELA_MAX) { toast.error(`Valor de Tela não pode exceder ${formatCurrency(VALOR_TELA_MAX)}`); return; }
    if (valorEntrada < 0) { toast.error("Valor de Entrada não pode ser negativo"); return; }
    if (valorEntrada > result.valorComDesconto) { toast.error("Valor de Entrada não pode ser maior que o valor com desconto"); return; }

    const discountCheck = checkDiscount(valorTelaComComissao, desconto1, desconto2, desconto3, plusPercentual);
    if (!discountCheck.allowed) {
      const valorDesc = valorTelaComComissao * (1 - desconto1/100) * (1 - desconto2/100) * (1 - desconto3/100);
      const discPct = valorTelaComComissao > 0 ? ((valorTelaComComissao - valorDesc) / valorTelaComComissao) * 100 : 0;
      await requestApproval({
        clientName: client?.nome || newClient.nome || "Novo cliente",
        vendedorName: currentUser?.nome_completo || currentUser?.apelido || "Vendedor",
        valorFinal: result.valorFinal, discountPercent: discPct, violations: discountCheck.violations,
      });
      return;
    }

    let clientId = client?.id;
    if (!clientId) {
      if (!showClientForm) { setShowClientForm(true); return; }
      if (!newClient.nome.trim()) { toast.error("Nome do cliente é obrigatório"); return; }
      setSaving(true);
      const { numero_orcamento: numeroOrcamento, numero_orcamento_seq: nextSeq } = await generateOrcamentoNumber(resolvedTenantId);
      const { data: created, error: clientError } = await supabase.from("clients").insert({
        nome: newClient.nome.trim(), cpf: newClient.cpf || null, telefone1: newClient.telefone1 || null,
        telefone2: newClient.telefone2 || null, email: newClient.email || null, vendedor: newClient.vendedor || null,
        quantidade_ambientes: newClient.quantidade_ambientes || 0, descricao_ambientes: newClient.descricao_ambientes || null,
        indicador_id: newClient.indicador_id || null, numero_orcamento: numeroOrcamento, numero_orcamento_seq: nextSeq,
        ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
      } as any).select("id").single();
      if (clientError || !created) { toast.error("Erro ao cadastrar cliente"); setSaving(false); return; }
      clientId = created.id;
      onClientCreated?.();
    } else { setSaving(true); }

    const uploadedEnvironments: SavedEnvironmentData[] = [];
    for (const env of environments) {
      let fileUrl: string | undefined;
      if (env.file && env.file.size > 0) { const uploaded = await uploadFile(env.file, clientId); if (uploaded) fileUrl = uploaded.url; }
      uploadedEnvironments.push({ id: env.id, fileName: env.fileName, environmentName: env.environmentName, pieceCount: env.pieceCount, totalValue: env.totalValue, importedAt: env.importedAt.toISOString(), fileUrl });
    }

    const arquivoNome = uploadedEnvironments.length > 0 ? JSON.stringify(uploadedEnvironments) : null;
    const arquivoUrl = uploadedEnvironments.length > 0 ? uploadedEnvironments.map(e => e.fileUrl).filter(Boolean).join(',') : null;

    const { data: existingSims } = await supabase.from("simulations").select("id, created_at").eq("client_id", clientId).order("created_at", { ascending: false });
    if (existingSims && existingSims.length >= 3) {
      await supabase.from("simulations").delete().in("id", existingSims.slice(2).map((s) => s.id));
    }

    const { error } = await supabase.from("simulations").insert({
      client_id: clientId, valor_tela: valorTela, desconto1, desconto2, desconto3,
      forma_pagamento: formaPagamento, parcelas, valor_entrada: valorEntrada, plus_percentual: plusPercentual,
      valor_final: result.valorFinal, valor_parcela: result.valorParcela,
      arquivo_url: arquivoUrl, arquivo_nome: arquivoNome, tenant_id: resolvedTenantId,
    } as any);
    setSaving(false);

    if (error) {
      const limitMsg = parsePlanLimitError(error.message || "");
      if (limitMsg) { setUpgradeMsg(limitMsg); setUpgradeOpen(true); }
      else toast.error("Erro ao salvar simulação");
    } else {
      savedRef.current = true;
      sessionStorage.removeItem(SIM_STORAGE_KEY);
      toast.success("Simulação salva com sucesso!");
      const userInfo = getAuditUserInfo();
      logAudit({ acao: "simulacao_salva", entidade: "simulation", entidade_id: clientId, detalhes: { valor_tela: valorTela, valor_final: result.valorFinal, forma_pagamento: formaPagamento, desconto1, desconto2, desconto3 }, ...userInfo });

      if (resolvedTenantId) {
        const totalDiscount = 100 - (100 * (1 - desconto1/100) * (1 - desconto2/100) * (1 - desconto3/100));
        const learnTable = supabase.from("ai_learning_events" as unknown as "clients");
        void (learnTable as unknown as { insert: (rows: unknown[]) => Promise<unknown> })
          .insert([{ tenant_id: resolvedTenantId, user_id: currentUser?.id || null, client_id: clientId, event_type: "proposal_sent", price_offered: result.valorFinal, discount_percentage: Math.round(totalDiscount * 100) / 100, strategy_used: "consultiva", metadata: { valor_tela: valorTela, forma_pagamento: formaPagamento, parcelas } }]).catch((err: unknown) => console.warn("[Simulator] learning event error:", err));
      }
      if (!client) {
        setShowClientForm(false);
        setNewClient({ nome: "", cpf: "", telefone1: "", telefone2: "", email: "", vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "" });
      }
    }
  };

  // ─── Close Sale ───
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
    if (!client) { toast.error("Selecione um cliente para fechar a venda"); return; }
    try {
      const tenantId = resolvedTenantId;
      if (tenantId) {
        const accessResult = await validateAccess(tenantId);
        if (!accessResult.allowed) {
          if (accessResult.reason?.includes("Básico")) toast.error(accessResult.reason, { duration: 6000 });
          else toast.error(accessResult.reason || "Acesso não permitido à Deal Room");
          return;
        }
        if (accessResult.plano === "basico" && accessResult.usage !== undefined && accessResult.limit !== undefined)
          toast.info(`Uso diário: ${accessResult.usage}/${accessResult.limit} negociação(ões) no plano Básico`, { duration: 4000 });
      }
    } catch {}
    setCloseSaleModalOpen(true);
  };

  const handleCloseSaleConfirm = async (formData: any, items: any[], itemDetails: any[]) => {
    setCloseSaleFormData(formData); setCloseSaleItems(items); setCloseSaleItemDetails(itemDetails);
    setCloseSaleModalOpen(false); setClosingSale(true);

    try {
      await handleSave();
      const { data: simData } = await supabase.from("simulations").select("id").eq("client_id", client!.id).order("created_at", { ascending: false }).limit(1).single();
      if (!simData) { toast.error("Simulação não encontrada"); setClosingSale(false); return; }

      const { data: template } = await supabase.from("contract_templates" as any).select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(1).single();
      if (!template) { toast.error("Nenhum modelo de contrato ativo encontrado. Cadastre um em Configurações > Contratos."); setClosingSale(false); return; }

      const html = buildContractHtml((template as any).conteudo_html, {
        formData, client: client!, valorTela, result, formaPagamento, parcelas, valorEntrada,
        settings, selectedIndicador, comissaoPercentual, items, itemDetails,
      });
      setPendingSimId(simData.id); setPendingTemplateId((template as any).id);
      setContractHtml(html); setContractEditorOpen(true);
    } catch (err) { console.error(err); toast.error("Erro ao fechar venda"); }
    setClosingSale(false);
  };

  const handleContractConfirm = async (finalHtml: string) => {
    if (!client || !pendingSimId) return;
    setClosingSale(true);
    const { error: contractError } = await supabase.from("client_contracts").insert({
      client_id: client.id, simulation_id: pendingSimId, template_id: pendingTemplateId,
      conteudo_html: finalHtml, ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
    } as any);
    if (contractError) { toast.error("Erro ao salvar contrato"); setClosingSale(false); return; }

    await supabase.from("clients").update({ status: "fechado" } as any).eq("id", client.id);

    try {
      const valorAVista = applyDiscounts(valorTelaComComissao, desconto1, desconto2, desconto3);
      const commResult = await generateSaleCommissions({
        clientId: client.id, clientName: client.nome, valorAVista,
        contratoNumero: closeSaleFormData?.numero_contrato || client.numero_orcamento || "",
        responsavelVenda: closeSaleFormData?.responsavel_venda || client.vendedor || "",
        selectedIndicador, comissaoPercentual,
      });
      if (commResult.error) toast.error(commResult.error);
      else if (commResult.count > 0) toast.success(`${commResult.count} comissão(ões) gerada(s) automaticamente`);
    } catch (err) { console.error("Erro ao gerar comissões:", err); }

    try {
      if (resolvedTenantId) {
        await recordSale(resolvedTenantId, {
          valor_venda: result.valorFinal, client_id: client.id, usuario_id: currentUser?.id,
          simulation_id: pendingSimId, forma_pagamento: formaPagamento,
          numero_contrato: closeSaleFormData?.numero_contrato || "",
          nome_cliente: client.nome, nome_vendedor: currentUser?.nome_completo || currentUser?.apelido || "",
        });
      }
    } catch (err) { console.error("Erro ao registrar transação Deal Room:", err); }

    openContractPrintWindow(finalHtml, `Contrato - ${client.nome}`);
    const userInfo = getAuditUserInfo();
    logAudit({ acao: "venda_fechada", entidade: "contract", entidade_id: pendingSimId, detalhes: { cliente: client.nome, cliente_id: client.id, valor_final: result.valorFinal, forma_pagamento: formaPagamento }, ...userInfo });

    try {
      const totalDiscPct = 100 - (result.valorFinal / (valorTela || 1)) * 100;
      const table = supabase.from("ai_learning_events" as unknown as "clients");
      void (table as unknown as { insert: (rows: unknown[]) => Promise<unknown> })
        .insert([{ tenant_id: resolvedTenantId, user_id: currentUser?.id || null, client_id: client.id, event_type: "deal_closed", strategy_used: "outro", price_offered: result.valorFinal, discount_percentage: Math.max(0, totalDiscPct), deal_result: "ganho", lead_temperature: client.status || "novo" }]);
    } catch (learnErr) { console.warn("[Simulator] learning event error:", learnErr); }

    toast.success("Venda fechada! Contrato gerado, comissões criadas e salvo.");
    setContractEditorOpen(false); setPendingSimId(null); setPendingTemplateId(null); setClosingSale(false);
  };

  const passwordDialogTitle = pendingUnlock === "desconto3" ? "Senha do Gerente" : "Senha do Administrador";

  // ─── Render ───
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
        <SimulatorParametersForm
          valorTela={valorTela} setValorTela={setValorTela}
          desconto1={desconto1} setDesconto1={setDesconto1}
          desconto2={desconto2} setDesconto2={setDesconto2}
          desconto3={desconto3} setDesconto3={setDesconto3}
          desconto3Unlocked={desconto3Unlocked}
          formaPagamento={formaPagamento} setFormaPagamento={setFormaPagamento}
          parcelas={parcelas} setParcelas={setParcelas}
          valorEntrada={valorEntrada} setValorEntrada={setValorEntrada}
          plusPercentual={plusPercentual} setPlusPercentual={setPlusPercentual}
          plusUnlocked={plusUnlocked}
          carenciaDias={carenciaDias} setCarenciaDias={setCarenciaDias}
          selectedIndicadorId={selectedIndicadorId} setSelectedIndicadorId={setSelectedIndicadorId}
          hideIndicador={hideIndicador} setHideIndicador={setHideIndicador}
          comissaoPercentual={comissaoPercentual}
          valorTelaComComissao={valorTelaComComissao}
          canHideIndicador={canHideIndicador}
          environments={environments} setEnvironments={setEnvironments}
          detectedSoftware={detectedSoftware}
          canDeleteEnvironment={canDeleteEnvironment}
          activeIndicadores={activeIndicadores}
          getOptionsForField={getOptionsForField}
          showParcelas={showParcelas} showPlus={showPlus} showCarencia={showCarencia}
          availableParcelas={availableParcelas}
          availableCarenciaOptions={availableCarenciaOptions}
          boletoProviders={boletoProviders} creditoProviders={creditoProviders}
          selectedBoletoProvider={selectedBoletoProvider}
          selectedCreditoProvider={selectedCreditoProvider}
          onBoletoProviderChange={(p) => { setSelectedBoletoProvider(p); applyBoletoDefaults(p); }}
          onCreditoProviderChange={(p) => { setSelectedCreditoProvider(p); applyCreditoDefaults(p); }}
          onRequestUnlock={requestUnlock}
          onFileImport={handleFileImport}
          onRemoveEnvironment={handleRemoveEnvironment}
          onLoadSimulation={() => setLoadSimModalOpen(true)}
          onProductPicker={() => setProductPickerOpen(true)}
          VALOR_TELA_MAX={VALOR_TELA_MAX} VALOR_ENTRADA_MAX={VALOR_ENTRADA_MAX}
        />

        <div className="space-y-6">
          <AIStrategyPanel
            valorTela={valorTela} valorTelaComComissao={valorTelaComComissao}
            discountOptions={{ desconto1: getOptionsForField("desconto1"), desconto2: getOptionsForField("desconto2"), desconto3: getOptionsForField("desconto3"), plus: getOptionsForField("plus") }}
            maxParcelas={maxParcelas}
            availableParcelas={availableBoletoInstallments.length > 0 ? availableBoletoInstallments : availableParcelas}
            currentFormaPagamento={formaPagamento}
            boletoProviderName={selectedBoletoProvider || undefined}
            onApplyStrategy={(s) => {
              setDesconto1(s.desconto1); setDesconto2(s.desconto2); setDesconto3(s.desconto3);
              setPlusPercentual(s.plusPercentual); setFormaPagamento(s.formaPagamento as any);
              setParcelas(s.parcelas); setValorEntrada(s.valorEntrada);
              if (s.desconto3 > 0) setDesconto3Unlocked(true);
              if (s.plusPercentual > 0) setPlusUnlocked(true);
            }}
            calculateResult={(s) => {
              const input: SimulationInput = {
                valorTela: valorTelaComComissao, desconto1: s.desconto1, desconto2: s.desconto2, desconto3: s.desconto3,
                formaPagamento: s.formaPagamento as FormaPagamento, parcelas: s.parcelas, valorEntrada: s.valorEntrada,
                plusPercentual: s.plusPercentual, creditRates: creditoCoeffMap, creditRatesFull: creditoRatesFullMap,
                boletoRates: boletoCoeffMap, boletoRatesFull: boletoRatesFullMap, carenciaDias,
              };
              const r = calculateSimulation(input);
              return { valorComDesconto: r.valorComDesconto, valorFinal: r.valorFinal, valorParcela: r.valorParcela, saldo: r.saldo };
            }}
            canAccess={(() => { const cargo = currentUser?.cargo_nome?.toUpperCase() || ""; return cargo.includes("ADMIN") || cargo.includes("GERENTE") || cargo.includes("PROJETISTA"); })()}
            historicalConversionRate={conversionStats.conversionRate}
          />

          <SimulatorResultCard
            valorTela={valorTela} valorTelaComComissao={valorTelaComComissao}
            comissaoPercentual={comissaoPercentual} hideIndicador={hideIndicador}
            result={result} valorEntrada={valorEntrada} parcelas={parcelas}
            showParcelas={showParcelas} showCarencia={showCarencia} carenciaDias={carenciaDias}
            saving={saving} closingSale={closingSale} hasClient={!!effectiveClient}
            generatingPdf={generatingPdf}
            onSave={handleSave}
            onPdf={effectiveClient ? async () => {
              if (!resolvedTenantId) { toast.error("Tenant não identificado"); return; }
              setGeneratingPdf(true);
              try {
                await generateAndOpenBudgetPdf(resolvedTenantId, {
                  clientName: effectiveClient.nome, clientCpf: effectiveClient.cpf || undefined,
                  clientEmail: effectiveClient.email || undefined, clientPhone: effectiveClient.telefone1 || undefined,
                  vendedor: effectiveClient.vendedor || undefined, companyName: settings.company_name,
                  companySubtitle: settings.company_subtitle || undefined, companyLogoUrl: settings.logo_url || undefined,
                  valorTela, desconto1, desconto2, desconto3, valorComDesconto: result.valorComDesconto,
                  formaPagamento, parcelas, valorEntrada, plusPercentual, taxaCredito: result.taxaCredito,
                  saldo: result.saldo, valorFinal: result.valorFinal, valorParcela: result.valorParcela,
                  ambientes: environments.map(e => ({ environmentName: e.environmentName, pieceCount: e.pieceCount, totalValue: e.totalValue })),
                });
              } finally { setGeneratingPdf(false); }
            } : null}
            onCloseSale={handleCloseSale}
            onClear={() => {
              setValorTela(0); setDesconto1(0); setDesconto2(0); setDesconto3(0);
              setFormaPagamento("A vista"); setParcelas(1); setValorEntrada(0);
              setPlusPercentual(0); setCarenciaDias(30); setSelectedIndicadorId("");
              setDesconto3Unlocked(false); setPlusUnlocked(false);
              setEnvironments([]); setImportedFile(null); setDetectedSoftware(null);
              setLinkedClient(null); setClientSearch("");
              sessionStorage.removeItem(SIM_STORAGE_KEY);
              toast.success("Simulação limpa");
            }}
          />

          {effectiveClient && (
            <DeliveryStatusPanel clientId={effectiveClient.id} contractNumber={effectiveClient.numero_orcamento || undefined} tenantId={resolvedTenantId} />
          )}

          {!effectiveClient && (
            <SimulatorClientPicker
              clientSearch={clientSearch} setClientSearch={setClientSearch}
              searchingClients={searchingClients} clientResults={clientResults}
              onLinkClient={(c) => { setLinkedClient(c); setClientSearch(""); setClientResults([]); }}
            />
          )}

          {linkedClient && !client && (
            <LinkedClientBadge client={linkedClient} onUnlink={() => { setLinkedClient(null); setClientSearch(""); }} />
          )}

          {!effectiveClient && showClientForm && (
            <SimulatorClientForm newClient={newClient} onChange={setNewClient} onCancel={() => setShowClientForm(false)} onSave={handleSave} saving={saving} projetistas={projetistas} indicadores={activeIndicadores} />
          )}
        </div>
      </div>

      <SimulatorDialogs
        passwordDialogOpen={passwordDialogOpen} setPasswordDialogOpen={setPasswordDialogOpen}
        passwordDialogTitle={passwordDialogTitle} passwordInput={passwordInput} setPasswordInput={setPasswordInput}
        onPasswordConfirm={handlePasswordConfirm}
        closeSaleModalOpen={closeSaleModalOpen} setCloseSaleModalOpen={setCloseSaleModalOpen}
        onCloseSaleConfirm={handleCloseSaleConfirm}
        client={client || null} closingSale={closingSale}
        simulationData={{
          valorFinal: result.valorFinal, valorEntrada, parcelas, valorParcela: result.valorParcela,
          formaPagamento, vendedor: client?.vendedor || "", numeroOrcamento: client?.numero_orcamento || "",
          ambientes: environments.map(env => ({
            nome: env.environmentName, valor: env.totalValue,
            fornecedor: (env as any).fornecedor || "", corpo: (env as any).corpo || "",
            porta: (env as any).porta || "", puxador: (env as any).puxador || "",
            complemento: (env as any).complemento || "", modelo: (env as any).modelo || "",
          })),
        }}
        contractEditorOpen={contractEditorOpen} setContractEditorOpen={setContractEditorOpen}
        contractHtml={contractHtml} onContractConfirm={handleContractConfirm}
        pendingSimId={pendingSimId} setPendingSimId={setPendingSimId}
        pendingTemplateId={pendingTemplateId} setPendingTemplateId={setPendingTemplateId}
        upgradeOpen={upgradeOpen} setUpgradeOpen={setUpgradeOpen} upgradeMsg={upgradeMsg}
        loadSimModalOpen={loadSimModalOpen} setLoadSimModalOpen={setLoadSimModalOpen}
        onLoadSimulation={(sim) => {
          setValorTela(sim.valor_tela); setDesconto1(sim.desconto1); setDesconto2(sim.desconto2); setDesconto3(sim.desconto3);
          setFormaPagamento(sim.forma_pagamento as FormaPagamento); setParcelas(sim.parcelas);
          setValorEntrada(sim.valor_entrada); setPlusPercentual(sim.plus_percentual);
          if (sim.desconto3 > 0) setDesconto3Unlocked(true);
          if (sim.plus_percentual > 0) setPlusUnlocked(true);
          if (sim.arquivo_nome) {
            try {
              const envs = JSON.parse(sim.arquivo_nome);
              if (Array.isArray(envs) && envs.length > 0) {
                setEnvironments(envs.map((e: any) => ({
                  id: e.id || crypto.randomUUID(), fileName: e.fileName || e.name || "",
                  environmentName: e.environmentName || e.name || "", pieceCount: e.pieceCount || 0,
                  totalValue: e.totalValue || Number(e.value) || 0, importedAt: new Date(e.importedAt || Date.now()),
                  file: new File([], e.fileName || ""),
                })));
              }
            } catch {}
          }
          toast.success(`Simulação de ${sim.client_name} carregada!`);
        }}
        productPickerOpen={productPickerOpen} setProductPickerOpen={setProductPickerOpen}
        onProductPickerConfirm={(items, total) => {
          setCatalogProductsTotal(total);
          const productEnv: ImportedEnvironment = {
            id: "catalog-products", fileName: "Catálogo",
            environmentName: `Produtos Avulsos (${items.length})`,
            pieceCount: items.reduce((s: any, i: any) => s + i.quantity, 0),
            totalValue: total, importedAt: new Date(), file: new File([], "catalogo.json"),
          };
          setEnvironments(prev => [...prev.filter(e => e.id !== "catalog-products"), productEnv]);
        }}
        resolvedTenantId={resolvedTenantId}
      />
    </div>
  );
}
