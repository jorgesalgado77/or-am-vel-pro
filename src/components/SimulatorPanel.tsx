import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { SimulatorParametersForm } from "@/components/simulator/SimulatorParametersForm";
import { SimulatorClientPicker, LinkedClientBadge } from "@/components/simulator/SimulatorClientPicker";
import type { ImportedEnvironment } from "@/components/simulator/SimulatorEnvironmentsTable";
import type { SelectedProduct } from "@/components/simulator/ProductPickerForSimulator";
import { SimulatorResultCard } from "@/components/simulator/SimulatorResultCard";
import { SimulatorClientForm } from "@/components/simulator/SimulatorClientForm";
import { PdfPreviewModal } from "@/components/simulator/PdfPreviewModal";
import { useConversionHistory } from "@/hooks/useConversionHistory";

import { calculateSimulation, formatCurrency, type FormaPagamento, type SimulationInput } from "@/lib/financing";
import { supabase } from "@/lib/supabaseClient";
import { parseArquivoNome } from "@/lib/parseArquivoNome";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDiscountOptions } from "@/hooks/useDiscountOptions";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useDiscountApproval } from "@/hooks/useDiscountApproval";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useTenantPlanContext } from "@/hooks/useTenantPlan";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { useDealRoom } from "@/hooks/useDealRoom";
import { useSimulatorRates } from "@/hooks/useSimulatorRates";
import { useSimulatorActions } from "@/hooks/useSimulatorActions";
import type { Database } from "@/integrations/supabase/types";

// Lazy-loaded heavy components
const AIStrategyPanel = lazy(() => import("@/components/AIStrategyPanel").then(m => ({ default: m.AIStrategyPanel })));
const DeliveryStatusPanel = lazy(() => import("@/components/simulator/DeliveryStatusPanel").then(m => ({ default: m.DeliveryStatusPanel })));
const SimulatorDialogs = lazy(() => import("@/components/simulator/SimulatorDialogs").then(m => ({ default: m.SimulatorDialogs })));

type Client = Database["public"]["Tables"]["clients"]["Row"];

export interface SavedEnvironmentData {
  id: string; fileName: string; environmentName: string;
  pieceCount: number; totalValue: number; importedAt: string; fileUrl?: string;
}

export interface SavedCatalogProduct {
  product_id: string; internal_code: string; name: string; sale_price: number; quantity: number;
  category?: string; stock_status?: string; description?: string;
}

export interface SavedSimulationData {
  valor_tela: number; desconto1: number; desconto2: number; desconto3: number;
  forma_pagamento: string; parcelas: number; valor_entrada: number;
  plus_percentual: number; ambientes?: SavedEnvironmentData[];
  catalogProducts?: SavedCatalogProduct[];
}

interface SimulatorPanelProps {
  client?: Client | null;
  onBack?: () => void;
  onClientCreated?: () => void;
  initialSimulation?: SavedSimulationData | null;
}

const SIM_STORAGE_KEY = "simulator_state";

interface SimulatorStoredState {
  valorTela: number; desconto1: number; desconto2: number; desconto3: number;
  formaPagamento: FormaPagamento; parcelas: number; valorEntrada: number;
  plusPercentual: number; carenciaDias: 30 | 60 | 90; selectedIndicadorId: string;
  desconto3Unlocked: boolean; plusUnlocked: boolean;
  hideIndicador: boolean; extremaLocked: boolean;
  selectedBoletoProvider: string; selectedCreditoProvider: string;
  linkedClientId: string;
  environments: Array<{ id: string; fileName: string; environmentName: string; pieceCount: number; totalValue: number; importedAt: string }>;
  catalogProducts?: Array<{ product: { id: string; internal_code: string; name: string; description: string; category: string; sale_price: number; stock_status: string; image_url?: string }; quantity: number }>;
}

function loadStoredState(): Partial<SimulatorStoredState> {
  try {
    const raw = sessionStorage.getItem(SIM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function SimulatorPanel({ client, onBack, onClientCreated, initialSimulation }: SimulatorPanelProps) {
  const stored = useMemo(() => {
    if (initialSimulation) return {};
    if (client) return loadStoredState();
    const s = loadStoredState();
    return s.valorTela ? s : {};
  }, []);

  const init = initialSimulation;
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
  const [desconto3Unlocked, setDesconto3Unlocked] = useState((init?.desconto3 ?? 0) > 0 || (stored.desconto3Unlocked ?? false));
  const [plusUnlocked, setPlusUnlocked] = useState((init?.plus_percentual ?? 0) > 0 || (stored.plusUnlocked ?? false));
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingUnlock, setPendingUnlock] = useState<"desconto3" | "plus" | "extrema" | null>(null);
  const [extremaLocked, setExtremaLocked] = useState(stored.extremaLocked ?? false);
  const [pendingExtremaCallback, setPendingExtremaCallback] = useState<(() => void) | null>(null);
  const [loadSimModalOpen, setLoadSimModalOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<SelectedProduct[]>(() => {
    if (init?.catalogProducts && init.catalogProducts.length > 0) {
      return init.catalogProducts.map((cp) => ({
        product: {
          id: cp.product_id, internal_code: cp.internal_code || "", name: cp.name || "",
          sale_price: cp.sale_price || 0, category: cp.category || "", stock_status: cp.stock_status || "in_stock",
          stock_quantity: 0, description: cp.description || "",
          width: 0, height: 0, depth: 0, environment: "", manufacturer_code: "",
        },
        quantity: cp.quantity,
      }));
    }
    const stored = loadStoredState();
    return (stored.catalogProducts as SelectedProduct[]) || [];
  });

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
  const [hideIndicador, setHideIndicador] = useState(stored.hideIndicador ?? false);
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
  const [showClientForm, setShowClientForm] = useState(false);
  const [newClient, setNewClient] = useState({
    nome: "", cpf: "", telefone1: "", telefone2: "", email: "",
    vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "",
  });
  const catalogProductsTotal = useMemo(
    () => catalogProducts.reduce((sum, item) => sum + item.product.sale_price * item.quantity, 0),
    [catalogProducts],
  );

  // ─── Hooks ───
  const { hasPermission, currentUser } = useCurrentUser();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  useEffect(() => { getResolvedTenantId().then(setResolvedTenantId); }, []);
  const { getOptionsForField } = useDiscountOptions();
  const { projetistas } = useUsuarios();
  const { activeIndicadores } = useIndicadores();
  const { isFeatureAllowed } = useTenantPlanContext();
  const canHideIndicador = isFeatureAllowed("ocultar_indicador");
  const { validateAccess, recordSale } = useDealRoom();
  const conversionStats = useConversionHistory(null);
  const { loadRules: loadDiscountRules, checkDiscount, requestApproval } = useDiscountApproval();

  useEffect(() => { loadDiscountRules(); }, [loadDiscountRules]);

  const selectedIndicador = activeIndicadores.find(i => i.id === selectedIndicadorId);
  const comissaoPercentual = selectedIndicador ? selectedIndicador.comissao_percentual : 0;
  const valorTelaComComissao = valorTela * (1 + comissaoPercentual / 100);

  // ─── Rates Hook ───
  const rates = useSimulatorRates({
    formaPagamento, parcelas, setParcelas, carenciaDias, setCarenciaDias,
    storedParcelas: stored.parcelas, storedCarencia: stored.carenciaDias,
  });

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
      catalogProducts,
    };
    sessionStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(state));
  }, [valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, carenciaDias, selectedIndicadorId, desconto3Unlocked, plusUnlocked, environments, catalogProducts]);

  // Update valorTela from environments (excluding catalog-products fake entry) + catalog total
  useEffect(() => {
    const envTotal = environments.filter(e => e.id !== "catalog-products").reduce((acc, env) => acc + env.totalValue, 0);
    if (envTotal > 0 || catalogProductsTotal > 0) {
      setValorTela(envTotal + catalogProductsTotal);
    }
  }, [environments, catalogProductsTotal]);

  // ─── Simulation Result ───
  const result = useMemo(() => {
    const input: SimulationInput = {
      valorTela: valorTelaComComissao, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
      creditRates: rates.creditoCoeffMap, creditRatesFull: rates.creditoRatesFullMap,
      boletoRates: rates.boletoCoeffMap, boletoRatesFull: rates.boletoRatesFullMap, carenciaDias,
    };
    return calculateSimulation(input);
  }, [valorTelaComComissao, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, rates.boletoCoeffMap, rates.boletoRatesFullMap, rates.creditoCoeffMap, rates.creditoRatesFullMap, carenciaDias]);

  // ─── Actions Hook ───
  const actions = useSimulatorActions({
    client, linkedClient, resolvedTenantId, currentUser, settings: rates.settings,
    valorTela, valorTelaComComissao, desconto1, desconto2, desconto3,
    formaPagamento, parcelas, valorEntrada, plusPercentual, carenciaDias,
    result, environments, setEnvironments, catalogProducts, setValorTela,
    setImportedFile, setDetectedSoftware, selectedIndicador, comissaoPercentual,
    checkDiscount, requestApproval, validateAccess, recordSale,
    onClientCreated, newClient, showClientForm, setShowClientForm, setNewClient,
  });

  useEffect(() => { return () => { if (!actions.savedRef.current) sessionStorage.removeItem(SIM_STORAGE_KEY); }; }, []);

  const canDeleteEnvironment = useMemo(() => {
    const cargo = currentUser?.cargo_nome?.toUpperCase() || "";
    return cargo.includes("ADMIN") || cargo.includes("GERENTE");
  }, [currentUser]);

  // ─── Unlock Handlers ───
  const isVendedorOrProjetista = useMemo(() => {
    const cargo = currentUser?.cargo_nome?.toUpperCase() || "";
    return cargo.includes("VENDEDOR") || cargo.includes("PROJETISTA");
  }, [currentUser]);

  const requestUnlock = (field: "desconto3" | "plus") => {
    if (field === "desconto3" && hasPermission("desconto3")) { setDesconto3Unlocked(true); return; }
    if (field === "plus" && hasPermission("plus")) { setPlusUnlocked(true); return; }
    const requiredPassword = field === "desconto3" ? rates.settings.manager_password : rates.settings.admin_password;
    if (!requiredPassword) { if (field === "desconto3") setDesconto3Unlocked(true); else setPlusUnlocked(true); return; }
    setPendingUnlock(field); setPasswordInput(""); setPasswordDialogOpen(true);
  };

  const requestExtremaUnlock = useCallback((_params: any, callback: () => void) => {
    // Admin/gerente can apply directly
    if (!isVendedorOrProjetista) {
      callback();
      return;
    }
    const requiredPassword = rates.settings.admin_password || rates.settings.manager_password;
    if (!requiredPassword) { callback(); return; }
    setPendingUnlock("extrema");
    setPendingExtremaCallback(() => callback);
    setPasswordInput("");
    setPasswordDialogOpen(true);
  }, [isVendedorOrProjetista, rates.settings.admin_password, rates.settings.manager_password]);

  const handlePasswordConfirm = () => {
    if (pendingUnlock === "extrema") {
      const pw = rates.settings.admin_password || rates.settings.manager_password;
      if (passwordInput === pw) {
        setPasswordDialogOpen(false);
        setExtremaLocked(true);
        setDesconto3Unlocked(true);
        setPlusUnlocked(true);
        if (pendingExtremaCallback) pendingExtremaCallback();
        setPendingExtremaCallback(null);
        toast.success("Estratégia Extrema liberada pelo gestor!");
      } else { toast.error("Senha incorreta"); }
      setPasswordInput("");
      return;
    }
    const requiredPassword = pendingUnlock === "desconto3" ? rates.settings.manager_password : rates.settings.admin_password;
    if (passwordInput === requiredPassword) {
      if (pendingUnlock === "desconto3") setDesconto3Unlocked(true);
      else if (pendingUnlock === "plus") setPlusUnlocked(true);
      setPasswordDialogOpen(false);
      toast.success("Acesso liberado!");
    } else { toast.error("Senha incorreta"); }
    setPasswordInput("");
  };

  const passwordDialogTitle = pendingUnlock === "extrema" ? "Senha do Gerente / Administrador" : pendingUnlock === "desconto3" ? "Senha do Gerente" : "Senha do Administrador";

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
          getOptionsForField={getOptionsForField}
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
          extremaLocked={extremaLocked && isVendedorOrProjetista}
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
          showParcelas={rates.showParcelas} showPlus={rates.showPlus} showCarencia={rates.showCarencia}
          availableParcelas={rates.availableParcelas}
          availableCarenciaOptions={rates.availableCarenciaOptions}
          boletoProviders={rates.boletoProviders} creditoProviders={rates.creditoProviders}
          selectedBoletoProvider={rates.selectedBoletoProvider}
          selectedCreditoProvider={rates.selectedCreditoProvider}
          onBoletoProviderChange={(p) => { rates.setSelectedBoletoProvider(p); rates.applyBoletoDefaults(p); }}
          onCreditoProviderChange={(p) => { rates.setSelectedCreditoProvider(p); rates.applyCreditoDefaults(p); }}
          onRequestUnlock={requestUnlock}
          onFileImport={actions.handleFileImport}
          onRemoveEnvironment={actions.handleRemoveEnvironment}
          onLoadSimulation={() => setLoadSimModalOpen(true)}
          onProductPicker={() => setProductPickerOpen(true)}
          VALOR_TELA_MAX={actions.VALOR_TELA_MAX} VALOR_ENTRADA_MAX={VALOR_ENTRADA_MAX}
          catalogProducts={catalogProducts}
          onUpdateCatalogProductQty={(productId, qty) => {
            setCatalogProducts((prev) => prev.map((item) => (
              item.product.id === productId
                ? { ...item, quantity: Math.max(1, Number.isFinite(qty) ? qty : 1) }
                : item
            )));
          }}
          onRemoveCatalogProduct={(productId) => {
            setCatalogProducts((prev) => prev.filter((item) => item.product.id !== productId));
          }}
        />

        <div className="space-y-6">
          <Suspense fallback={<div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>}>
            <AIStrategyPanel
              valorTela={valorTela} valorTelaComComissao={valorTelaComComissao}
              discountOptions={{ desconto1: getOptionsForField("desconto1"), desconto2: getOptionsForField("desconto2"), desconto3: getOptionsForField("desconto3"), plus: getOptionsForField("plus") }}
              maxParcelas={rates.maxParcelas}
              availableParcelas={rates.availableBoletoInstallments.length > 0 ? rates.availableBoletoInstallments : rates.availableParcelas}
              currentFormaPagamento={formaPagamento}
              boletoProviderName={rates.selectedBoletoProvider || undefined}
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
                  plusPercentual: s.plusPercentual, creditRates: rates.creditoCoeffMap, creditRatesFull: rates.creditoRatesFullMap,
                  boletoRates: rates.boletoCoeffMap, boletoRatesFull: rates.boletoRatesFullMap, carenciaDias,
                };
                const r = calculateSimulation(input);
                return { valorComDesconto: r.valorComDesconto, valorFinal: r.valorFinal, valorParcela: r.valorParcela, saldo: r.saldo };
              }}
              canAccess={(() => { const cargo = currentUser?.cargo_nome?.toUpperCase() || ""; return cargo.includes("ADMIN") || cargo.includes("GERENTE") || cargo.includes("PROJETISTA") || cargo.includes("VENDEDOR"); })()}
              historicalConversionRate={conversionStats.conversionRate}
              onRequestExtremaUnlock={requestExtremaUnlock}
              extremaUnlocked={!isVendedorOrProjetista || extremaLocked}
            />
          </Suspense>

          <SimulatorResultCard
            valorTela={valorTela} valorTelaComComissao={valorTelaComComissao}
            comissaoPercentual={comissaoPercentual} hideIndicador={hideIndicador} plusPercentual={plusPercentual}
            result={result} valorEntrada={valorEntrada} parcelas={parcelas}
            showParcelas={rates.showParcelas} showCarencia={rates.showCarencia} carenciaDias={carenciaDias}
            saving={actions.saving} closingSale={actions.closingSale} hasClient={!!effectiveClient}
            generatingPdf={actions.generatingPdf}
            onSave={actions.handleSave}
            onPdf={effectiveClient ? async () => {
              setPdfLoading(true);
              setPdfModalOpen(true);
              setPdfUrl(null);
              const url = await actions.handlePdf();
              setPdfUrl(url);
              setPdfLoading(false);
            } : null}
            onCloseSale={actions.handleCloseSale}
            onClear={() => {
              setValorTela(0); setDesconto1(0); setDesconto2(0); setDesconto3(0);
              setFormaPagamento("A vista"); setParcelas(1); setValorEntrada(0);
              setPlusPercentual(0); setCarenciaDias(30); setSelectedIndicadorId("");
              setDesconto3Unlocked(false); setPlusUnlocked(false); setExtremaLocked(false);
              setEnvironments([]); setImportedFile(null); setDetectedSoftware(null);
              setCatalogProducts([]);
              setLinkedClient(null); setClientSearch("");
              sessionStorage.removeItem(SIM_STORAGE_KEY);
              toast.success("Simulação limpa");
            }}
          />

          {effectiveClient && (
            <Suspense fallback={null}>
              <DeliveryStatusPanel clientId={effectiveClient.id} contractNumber={effectiveClient.numero_orcamento || undefined} tenantId={resolvedTenantId} />
            </Suspense>
          )}

          {!effectiveClient && (
            <SimulatorClientPicker
              clientSearch={clientSearch} setClientSearch={setClientSearch}
              searchingClients={searchingClients} clientResults={clientResults}
              onLinkClient={(c) => { setLinkedClient(c); setClientSearch(""); setClientResults([]); }}
              vendedores={projetistas.map(p => ({ id: p.id, nome_completo: p.nome_completo }))}
              selectedVendedorNome={newClient.vendedor}
              onVendedorChange={(nome) => setNewClient(prev => ({ ...prev, vendedor: nome }))}
              onQuickClientOpen={() => setShowClientForm(true)}
            />
          )}

          {linkedClient && !client && (
            <LinkedClientBadge client={linkedClient} onUnlink={() => { setLinkedClient(null); setClientSearch(""); }} />
          )}

          {!effectiveClient && showClientForm && (
            <SimulatorClientForm newClient={newClient} onChange={setNewClient} onCancel={() => setShowClientForm(false)} onSave={actions.handleSave} saving={actions.saving} projetistas={projetistas} indicadores={activeIndicadores} />
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <SimulatorDialogs
          passwordDialogOpen={passwordDialogOpen} setPasswordDialogOpen={setPasswordDialogOpen}
          passwordDialogTitle={passwordDialogTitle} passwordInput={passwordInput} setPasswordInput={setPasswordInput}
          onPasswordConfirm={handlePasswordConfirm}
          closeSaleModalOpen={actions.closeSaleModalOpen} setCloseSaleModalOpen={actions.setCloseSaleModalOpen}
          onCloseSaleConfirm={actions.handleCloseSaleConfirm}
          client={client || null} closingSale={actions.closingSale}
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
          contractEditorOpen={actions.contractEditorOpen} setContractEditorOpen={actions.setContractEditorOpen}
          contractHtml={actions.contractHtml} onContractConfirm={actions.handleContractConfirm}
          pendingSimId={actions.pendingSimId} setPendingSimId={actions.setPendingSimId}
          pendingTemplateId={actions.pendingTemplateId} setPendingTemplateId={actions.setPendingTemplateId}
          upgradeOpen={actions.upgradeOpen} setUpgradeOpen={actions.setUpgradeOpen} upgradeMsg={actions.upgradeMsg}
          loadSimModalOpen={loadSimModalOpen} setLoadSimModalOpen={setLoadSimModalOpen}
          onLoadSimulation={(sim) => {
            setValorTela(sim.valor_tela); setDesconto1(sim.desconto1); setDesconto2(sim.desconto2); setDesconto3(sim.desconto3);
            setFormaPagamento(sim.forma_pagamento as FormaPagamento); setParcelas(sim.parcelas);
            setValorEntrada(sim.valor_entrada); setPlusPercentual(sim.plus_percentual);
            setCatalogProducts([]);
            if (sim.desconto3 > 0) setDesconto3Unlocked(true);
            if (sim.plus_percentual > 0) setPlusUnlocked(true);
            if (sim.arquivo_nome) {
              const { environments: envs, catalogProducts: catProds } = parseArquivoNome(sim.arquivo_nome);
              if (envs.length > 0) {
                setEnvironments(envs.map((e: any) => ({
                  id: e.id || crypto.randomUUID(), fileName: e.fileName || e.name || "",
                  environmentName: e.environmentName || e.name || "", pieceCount: e.pieceCount || 0,
                  totalValue: e.totalValue || Number(e.value) || 0, importedAt: new Date(e.importedAt || Date.now()),
                  file: new File([], e.fileName || ""),
                })));
              }
              if (catProds.length > 0) {
                setCatalogProducts(catProds.map((cp: any) => ({
                  product: {
                    id: cp.product_id, internal_code: cp.internal_code || "", name: cp.name || "",
                    sale_price: cp.sale_price || 0, category: cp.category || "", stock_status: cp.stock_status || "in_stock",
                    stock_quantity: cp.stock_quantity ?? 0, description: cp.description || "",
                    width: cp.width ?? 0, height: cp.height ?? 0, depth: cp.depth ?? 0,
                    environment: cp.environment || "", manufacturer_code: cp.manufacturer_code || "",
                  },
                  quantity: cp.quantity,
                })));
              }
            }
            toast.success(`Simulação de ${sim.client_name} carregada!`);
          }}
          productPickerOpen={productPickerOpen} setProductPickerOpen={setProductPickerOpen}
          onProductPickerConfirm={(items) => {
            setCatalogProducts((prev) => {
              const merged = new Map(prev.map((item) => [item.product.id, item]));

              for (const item of items) {
                const existing = merged.get(item.product.id);
                merged.set(item.product.id, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
              }

              return Array.from(merged.values());
            });
          }}
          resolvedTenantId={resolvedTenantId}
        />
      </Suspense>
      <PdfPreviewModal open={pdfModalOpen} onOpenChange={setPdfModalOpen} pdfUrl={pdfUrl} loading={pdfLoading} />
    </div>
  );
}
