import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { parsePlanLimitError } from "@/components/shared/UpgradePlanDialog";
import { generateOrcamentoNumber, applyDiscounts } from "@/services/financialService";
import { buildContractHtml } from "@/services/contractService";
import { generateSaleCommissions } from "@/services/commissionService";
import { generateBudgetPdfServerSide } from "@/lib/pdfService";
import { openContractPrintWindow } from "@/lib/contractDocument";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { recordStockMovement } from "@/lib/stockMovement";
import { logError, logEvent } from "@/services/system/SystemDiagnosticsService";
import { validateFileUpload } from "@/lib/validation";
import { parseProjectFileMulti } from "@/services/fileImportService";
import { formatCurrency, type FormaPagamento, type SimulationInput, calculateSimulation } from "@/lib/financing";
import type { ImportedEnvironment } from "@/components/simulator/SimulatorEnvironmentsTable";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const SIM_STORAGE_KEY = "simulator_state";

const DEFAULT_CONTRACT_TEMPLATE_HTML = `
  <h1>Contrato de Venda</h1>
  <p><strong>Número do contrato:</strong> {{numero_contrato}}</p>
  <p><strong>Data do fechamento:</strong> {{data_fechamento}}</p>

  <h2>Cliente</h2>
  <p><strong>Nome:</strong> {{nome_cliente}}</p>
  <p><strong>CPF/CNPJ:</strong> {{cpf_cliente}}</p>
  <p><strong>RG:</strong> {{rg_insc_estadual}}</p>
  <p><strong>Telefone:</strong> {{telefone_cliente}}</p>
  <p><strong>Email:</strong> {{email_cliente}}</p>
  <p><strong>Profissão:</strong> {{profissao}}</p>
  <p><strong>Tipo de Contrato:</strong> {{tipo_contrato}}</p>

  <h2>Endereço</h2>
  <p>{{endereco}}, {{bairro}} - {{cidade}}/{{uf}} - {{cep}}</p>

  <h2>Endereço de Entrega</h2>
  <p>{{endereco_entrega_completo}}</p>
  <p><strong>Prazo de Entrega:</strong> {{prazo_entrega}}</p>

  <h2>Ambientes e Valores</h2>
  {{ambientes_valores_tabela}}

  <h2>Detalhes dos Ambientes</h2>
  {{ambientes_cores_tabela}}

  <h2>Itens do Projeto</h2>
  {{itens_tabela}}

  <h2>Detalhamento Técnico</h2>
  {{itens_detalhes}}

  <h2>Produtos do Catálogo</h2>
  {{produtos_catalogo_completo}}

  <h2>Pagamento</h2>
  <p><strong>Valor total:</strong> {{valor_final}} ({{valor_por_extenso}})</p>
  <p><strong>Entrada:</strong> {{valor_entrada}}</p>
  <p><strong>Parcelas:</strong> {{parcelas}}x de {{valor_parcela}}</p>
  <p><strong>Forma de pagamento:</strong> {{forma_pagamento}}</p>
  <p><strong>Condições:</strong> {{condicoes_pagamento}}</p>

  <h2>Observações</h2>
  <p>{{observacoes}}</p>

  <h2 style="color:#0891b2;">RESPONSÁVEIS</h2>
  <hr/>
  <table style="width:100%;border:none;border-collapse:collapse;margin-top:16px;">
    <tr>
      <td style="width:50%;border:none;vertical-align:top;"><strong>Vendedor:</strong> {{responsavel_venda}}</td>
      <td style="width:50%;border:none;vertical-align:top;text-align:right;"><strong>Projetista:</strong> {{projetista}}</td>
    </tr>
  </table>
  <table style="width:100%;border:none;border-collapse:collapse;margin-top:8px;">
    <tr>
      <td style="width:50%;border:none;"><strong>Indicador:</strong> {{indicador_nome}}</td>
      <td style="width:50%;border:none;text-align:right;"><strong>Nº Orçamento:</strong> {{numero_orcamento}}</td>
    </tr>
  </table>

  <p style="text-align:center;margin-top:16px;">{{cidade}}, {{data_atual}}</p>

  <table style="width:100%;border:none;border-collapse:collapse;margin-top:48px;">
    <tr>
      <td style="width:50%;border:none;text-align:center;padding-top:32px;border-top:1px solid #000;">{{empresa_nome}}</td>
      <td style="width:50%;border:none;text-align:center;padding-top:32px;border-top:1px solid #000;">{{nome_cliente}}</td>
    </tr>
  </table>
`;

interface UseSimulatorActionsParams {
  client: Client | null | undefined;
  linkedClient: Client | null;
  resolvedTenantId: string | null;
  currentUser: any;
  settings: any;
  valorTela: number;
  valorTelaComComissao: number;
  desconto1: number; desconto2: number; desconto3: number;
  formaPagamento: FormaPagamento;
  parcelas: number;
  valorEntrada: number;
  plusPercentual: number;
  carenciaDias: 30 | 60 | 90;
  result: any;
  environments: ImportedEnvironment[];
  setEnvironments: React.Dispatch<React.SetStateAction<ImportedEnvironment[]>>;
  catalogProducts: Array<{ product: { id: string; internal_code: string; name: string; sale_price: number }; quantity: number }>;
  setValorTela: (v: number) => void;
  setImportedFile: (f: File | null) => void;
  setDetectedSoftware: (s: string | null) => void;
  selectedIndicador: any;
  comissaoPercentual: number;
  checkDiscount: (vt: number, d1: number, d2: number, d3: number, plus: number) => { allowed: boolean; violations: string[] };
  requestApproval: (data: any) => Promise<void>;
  validateAccess: (tenantId: string) => Promise<any>;
  recordSale: (tenantId: string, data: any) => Promise<any>;
  onClientCreated?: () => void;
  newClient: any;
  showClientForm: boolean;
  setShowClientForm: (v: boolean) => void;
  setNewClient: (v: any) => void;
  activeStrategy?: string;
  aiStrategyEnabled?: boolean;
}

export function useSimulatorActions(params: UseSimulatorActionsParams) {
  const {
    client, linkedClient, resolvedTenantId, currentUser, settings,
    valorTela, valorTelaComComissao, desconto1, desconto2, desconto3,
    formaPagamento, parcelas, valorEntrada, plusPercentual, carenciaDias,
    result, environments, setEnvironments, catalogProducts, setValorTela, setImportedFile, setDetectedSoftware,
    selectedIndicador, comissaoPercentual,
    checkDiscount, requestApproval, validateAccess, recordSale,
    onClientCreated, newClient, showClientForm, setShowClientForm, setNewClient,
    activeStrategy, aiStrategyEnabled,
  } = params;

  const effectiveClient = client || linkedClient;
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [closingSale, setClosingSale] = useState(false);
  const [contractEditorOpen, setContractEditorOpen] = useState(false);
  const [contractHtml, setContractHtml] = useState("");
  const [pendingSimId, setPendingSimId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [closeSaleModalOpen, setCloseSaleModalOpen] = useState(false);
  const [closeSaleFormData, setCloseSaleFormData] = useState<any>(null);
  const [closeSaleItems, setCloseSaleItems] = useState<any[]>([]);
  const [closeSaleItemDetails, setCloseSaleItemDetails] = useState<any[]>([]);
  const [savedContractFormData, setSavedContractFormData] = useState<any>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState("");
  const savedRef = useRef(false);

  const reportCloseSaleIssue = (message: string, metadata?: Record<string, unknown>) => {
    console.warn("[CloseSaleFlow]", message, metadata ?? {});
    toast.error(message, { duration: 7000 });
    logEvent({
      event_type: "integration",
      source: "close_sale_flow",
      message,
      metadata: {
        client_id: effectiveClient?.id ?? null,
        tenant_id: resolvedTenantId ?? null,
        ...metadata,
      },
    });
  };

  const VALOR_TELA_MAX = 50_000_000;

  const uploadFile = async (file: File, clientId: string): Promise<{ url: string; nome: string } | null> => {
    const ext = file.name.split(".").pop() || "txt";
    const path = `projetos/${clientId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
    return { url: urlData.publicUrl, nome: file.name };
  };

  const handleFileImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".txt,.xml,.promob"; input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach((file) => {
        const fileValidation = validateFileUpload(file);
        if (!fileValidation.valid) { toast.error(fileValidation.message || "Arquivo inválido"); return; }
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const content = ev.target?.result as string;
          if (!content) return;
          const parsedResults = parseProjectFileMulti(content, file.name);

          // Look up registered fornecedores to auto-fill prazo
          let fornecedoresMap: Record<string, string> = {};
          if (resolvedTenantId) {
            try {
              const { data: settingsData } = await supabase
                .from("tenant_settings" as any)
                .select("valor")
                .eq("tenant_id", resolvedTenantId)
                .eq("chave", "fornecedores")
                .maybeSingle();
              if (settingsData && (settingsData as any).valor) {
                const fornecedores = JSON.parse((settingsData as any).valor) as Array<{ nome: string; prazo_entrega?: string }>;
                for (const f of fornecedores) {
                  if (f.nome && f.prazo_entrega) {
                    fornecedoresMap[f.nome.toLowerCase().trim()] = f.prazo_entrega;
                  }
                }
              }
            } catch { /* ignore */ }
          }

          const newEnvs: ImportedEnvironment[] = parsedResults.map((parsed) => {
            const hasTotal = parsed.total !== null && !isNaN(parsed.total) && parsed.total > 0;
            // Auto-fill prazo from registered fornecedor
            let prazo = "";
            if (parsed.fornecedor) {
              const key = parsed.fornecedor.toLowerCase().trim();
              prazo = fornecedoresMap[key] || "";
            }
            return {
              id: crypto.randomUUID(), fileName: file.name, environmentName: parsed.envName,
              pieceCount: parsed.pieces, totalValue: hasTotal ? (parsed.total as number) : 0, importedAt: new Date(), file,
              fornecedor: parsed.fornecedor || "", corpo: parsed.corpo || "", porta: parsed.porta || "",
              puxador: parsed.puxador || "", complemento: parsed.complemento || "", modelo: parsed.modelo || "",
              prazo,
              fileFormat: parsed.fileFormat,
              modules: parsed.modules,
            };
          });
          setEnvironments((prev) => [...prev, ...newEnvs]);
          setImportedFile(file);
          const sw = parsedResults[0]?.software;
          if (sw && sw !== "generico") setDetectedSoftware(sw);
          if (newEnvs.length > 1) {
            const total = newEnvs.reduce((s, env) => s + env.totalValue, 0);
            toast.success(`${newEnvs.length} ambientes importados de "${file.name}": ${formatCurrency(total)}`);
          } else if (newEnvs.length === 1) {
            const env = newEnvs[0];
            if (env.totalValue > 0) {
              toast.success(`Ambiente "${env.environmentName}" importado: ${formatCurrency(env.totalValue)}`);
            } else {
              toast.warning(`Ambiente "${env.environmentName}" importado sem valor total. Preencha manualmente.`);
            }
          }
        };
        reader.readAsText(file);
      });
    };
    input.click();
  }, [setEnvironments, setImportedFile, setDetectedSoftware]);

  const handleRemoveEnvironment = useCallback((envId: string) => {
    setEnvironments((prev) => {
      const updated = prev.filter((e) => e.id !== envId);
      if (updated.length === 0) { setValorTela(0); setImportedFile(null); }
      return updated;
    });
    toast.success("Ambiente removido");
  }, [setEnvironments, setValorTela, setImportedFile]);

  const handleSave = useCallback(async (options?: { silent?: boolean }): Promise<string | null> => {
    const silent = options?.silent ?? false;
    if (!resolvedTenantId) {
      const message = "Não foi possível identificar a loja atual; recarregue a página e tente novamente.";
      console.error("[SimulatorSave] No tenant ID");
      toast.error(message, { duration: 7000 });
      logError({
        source: "simulator_save",
        message,
        context: {
          step: "pre_validation",
          client_id: effectiveClient?.id ?? null,
        },
      });
      return null;
    }
    if (valorTela <= 0) { console.warn("[SimulatorSave] valorTela <= 0:", valorTela); toast.error("Informe um Valor de Tela maior que zero"); return null; }
    if (valorTela > VALOR_TELA_MAX) { console.warn("[SimulatorSave] valorTela > MAX"); toast.error(`Valor de Tela não pode exceder ${formatCurrency(VALOR_TELA_MAX)}`); return null; }
    if (valorEntrada < 0) { console.warn("[SimulatorSave] valorEntrada < 0"); toast.error("Valor de Entrada não pode ser negativo"); return null; }
    if (valorEntrada > result.valorComDesconto) { console.warn("[SimulatorSave] valorEntrada > valorComDesconto"); toast.error("Valor de Entrada não pode ser maior que o valor com desconto"); return null; }

    if (!silent) {
      const discountCheck = checkDiscount(valorTelaComComissao, desconto1, desconto2, desconto3, plusPercentual);
      if (!discountCheck.allowed) {
        const valorDesc = valorTelaComComissao * (1 - desconto1 / 100) * (1 - desconto2 / 100) * (1 - desconto3 / 100);
        const discPct = valorTelaComComissao > 0 ? ((valorTelaComComissao - valorDesc) / valorTelaComComissao) * 100 : 0;
        await requestApproval({
          clientName: effectiveClient?.nome || newClient.nome || "Novo cliente",
          vendedorName: currentUser?.nome_completo || currentUser?.apelido || "Vendedor",
          valorFinal: result.valorFinal, discountPercent: discPct, violations: discountCheck.violations,
        });
        return null;
      }
    }

    let clientId = effectiveClient?.id;
    if (!clientId) {
      if (!showClientForm) { setShowClientForm(true); return null; }
      if (!newClient.nome.trim()) { toast.error("Nome do cliente é obrigatório"); return null; }
      setSaving(true);
      const { numero_orcamento: numeroOrcamento, numero_orcamento_seq: nextSeq } = await generateOrcamentoNumber(resolvedTenantId);
      const { data: created, error: clientError } = await supabase.from("clients").insert({
        nome: newClient.nome.trim(), cpf: newClient.cpf || null, telefone1: newClient.telefone1 || null,
        telefone2: newClient.telefone2 || null, email: newClient.email || null, vendedor: newClient.vendedor || null,
        quantidade_ambientes: newClient.quantidade_ambientes || 0, descricao_ambientes: newClient.descricao_ambientes || null,
        indicador_id: newClient.indicador_id || null, numero_orcamento: numeroOrcamento, numero_orcamento_seq: nextSeq,
        ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
      } as any).select("id").single();
      if (clientError || !created) {
        const message = clientError?.message
          ? `Não foi possível cadastrar o cliente: ${clientError.message}`
          : "Não foi possível cadastrar o cliente.";
        toast.error(message, { duration: 7000 });
        logError({
          source: "simulator_save",
          message,
          context: {
            step: "create_client",
            client_name: newClient.nome,
          },
        });
        setSaving(false);
        return null;
      }
      clientId = created.id;
      onClientCreated?.();
    } else {
      setSaving(true);
    }

    const uploadedEnvironments: any[] = [];
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
        fornecedor: env.fornecedor || "",
        corpo: env.corpo || "",
        porta: env.porta || "",
        puxador: env.puxador || "",
        complemento: env.complemento || "",
        modelo: env.modelo || "",
        modules: env.modules || [],
      });
    }

    const catalogSerialized = catalogProducts.map(item => ({
      product_id: item.product.id,
      internal_code: item.product.internal_code,
      name: item.product.name,
      sale_price: item.product.sale_price,
      quantity: item.quantity,
    }));
    const iaMetadata = {
      iaStrategyEnabled: !!aiStrategyEnabled,
      estrategiaIa: aiStrategyEnabled ? (activeStrategy || null) : null,
    };
    const hasEnvs = uploadedEnvironments.length > 0;
    const hasCatalog = catalogSerialized.length > 0;
    const hasAiMetadata = iaMetadata.iaStrategyEnabled || !!iaMetadata.estrategiaIa;
    const arquivoNome = (hasEnvs || hasCatalog || hasAiMetadata)
      ? JSON.stringify({ environments: uploadedEnvironments, catalogProducts: catalogSerialized, metadata: iaMetadata })
      : null;
    const arquivoUrl = hasEnvs ? uploadedEnvironments.map((e: any) => e.fileUrl).filter(Boolean).join(",") : null;

    const { data: existingSims } = await supabase.from("simulations").select("id, created_at").eq("client_id", clientId).order("created_at", { ascending: false });
    if (existingSims && existingSims.length >= 3) {
      await supabase.from("simulations").delete().in("id", existingSims.slice(2).map((s) => s.id));
    }

    const { data: createdSimulation, error } = await supabase.from("simulations").insert({
      client_id: clientId,
      valor_tela: valorTela,
      desconto1,
      desconto2,
      desconto3,
      forma_pagamento: formaPagamento,
      parcelas,
      valor_entrada: valorEntrada,
      plus_percentual: plusPercentual,
      valor_final: result.valorFinal,
      valor_parcela: result.valorParcela,
      arquivo_url: arquivoUrl,
      arquivo_nome: arquivoNome,
      tenant_id: resolvedTenantId,
      estrategia_ia: aiStrategyEnabled ? (activeStrategy || null) : null,
    } as any).select("id").single();
    setSaving(false);

    if (error || !createdSimulation) {
      const limitMsg = parsePlanLimitError(error?.message || "");
      if (limitMsg) {
        setUpgradeMsg(limitMsg);
        setUpgradeOpen(true);
      } else {
        const message = error?.message
          ? `Não foi possível salvar a simulação: ${error.message}`
          : "Não foi possível salvar a simulação.";
        toast.error(message, { duration: 7000 });
      }
      logError({
        source: "simulator_save",
        message: error?.message || "Erro ao salvar simulação",
        context: {
          step: "insert_simulation",
          client_id: clientId,
          tenant_id: resolvedTenantId,
        },
      });
      return null;
    }

    savedRef.current = true;
    sessionStorage.removeItem(SIM_STORAGE_KEY);
    if (!silent) toast.success("Simulação salva com sucesso!");
    const userInfo = getAuditUserInfo();
    logAudit({ acao: "simulacao_salva", entidade: "simulation", entidade_id: clientId, detalhes: { valor_tela: valorTela, valor_final: result.valorFinal, forma_pagamento: formaPagamento, desconto1, desconto2, desconto3, valor_entrada: valorEntrada, ia_ativa: !!aiStrategyEnabled, estrategia_ia: aiStrategyEnabled ? (activeStrategy || null) : null }, ...userInfo });

    if (resolvedTenantId) {
      const totalDiscount = 100 - (100 * (1 - desconto1 / 100) * (1 - desconto2 / 100) * (1 - desconto3 / 100));
      void supabase.from("ai_learning_events" as unknown as "clients")
        .insert([{ tenant_id: resolvedTenantId, user_id: currentUser?.id || null, client_id: clientId, event_type: "proposal_sent", price_offered: result.valorFinal, discount_percentage: Math.round(totalDiscount * 100) / 100, strategy_used: aiStrategyEnabled ? (activeStrategy || "consultiva") : "consultiva", metadata: { valor_tela: valorTela, forma_pagamento: formaPagamento, parcelas, valor_entrada: valorEntrada } } as any])
        .then(({ error: learnErr }) => { if (learnErr) console.warn("[Simulator] learning event error:", learnErr); });
    }
    if (!effectiveClient) {
      setShowClientForm(false);
      setNewClient({ nome: "", cpf: "", telefone1: "", telefone2: "", email: "", vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "" });
    }

    return createdSimulation.id;
  }, [valorTela, valorEntrada, valorTelaComComissao, desconto1, desconto2, desconto3, plusPercentual, formaPagamento, parcelas, result, effectiveClient, newClient, showClientForm, environments, catalogProducts, resolvedTenantId, currentUser, checkDiscount, requestApproval, onClientCreated, setShowClientForm, setNewClient, activeStrategy, aiStrategyEnabled]);

  const REQUIRED_TECH_KEYS: (keyof ImportedEnvironment)[] = ["corpo", "porta", "puxador", "fornecedor"];
  const [techFieldsHighlight, setTechFieldsHighlight] = useState(false);

  const handleCloseSale = useCallback(async () => {
    if (!effectiveClient) {
      reportCloseSaleIssue("Selecione ou vincule um cliente antes de usar 'Salvar Contrato e Continuar'.", { step: "open_close_sale" });
      return;
    }
    if (!resolvedTenantId) {
      reportCloseSaleIssue("Loja atual não identificada; faça login novamente antes de continuar.", { step: "open_close_sale", reason: "missing_tenant_id" });
      return;
    }
    if (environments.length > 0) {
      const incompleteEnvs = environments.filter(env =>
        REQUIRED_TECH_KEYS.some(k => !String(env[k] || "").trim())
      );
      if (incompleteEnvs.length > 0) {
        setTechFieldsHighlight(true);
        setTimeout(() => setTechFieldsHighlight(false), 4000);
        setTimeout(() => {
          document.getElementById("simulator-environments-table")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
        toast.error(`${incompleteEnvs.length} ambiente(s) com campos técnicos obrigatórios pendentes (Corpo, Porta, Puxador, Fornecedor). Preencha antes de fechar a venda.`, { duration: 6000 });
        return;
      }
    }
    // Deal Room access check removed — closing a sale should not require Deal Room
    logEvent({
      event_type: "integration",
      source: "close_sale_flow",
      message: "Modal de fechamento de venda aberto",
      metadata: { client_id: effectiveClient.id, tenant_id: resolvedTenantId },
    });

    // Check for existing contract with saved form data
    try {
      const { data: existingContract } = await supabase
        .from("client_contracts")
        .select("form_data")
        .eq("client_id", effectiveClient.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingContract && (existingContract as any).form_data) {
        setSavedContractFormData((existingContract as any).form_data);
      } else {
        setSavedContractFormData(null);
      }
    } catch {
      setSavedContractFormData(null);
    }

    setCloseSaleModalOpen(true);
  }, [effectiveClient, resolvedTenantId, environments]);

  const handleCloseSaleConfirm = useCallback(async (formData: any, items: any[], itemDetails: any[]) => {
    if (!effectiveClient) {
      reportCloseSaleIssue("Selecione ou vincule um cliente antes de continuar.", { step: "confirm_close_sale" });
      return false;
    }
    if (!resolvedTenantId) {
      reportCloseSaleIssue("Loja não identificada; faça login novamente.", { step: "confirm_close_sale", reason: "missing_tenant_id" });
      return false;
    }
    setCloseSaleFormData(formData);
    setCloseSaleItems(items);
    setCloseSaleItemDetails(itemDetails);
    setClosingSale(true);
    try {
      const simulationId = await handleSave({ silent: true });
      if (!simulationId) {
        reportCloseSaleIssue("A simulação não foi salva. Verifique os dados e tente novamente.", { step: "save_before_contract" });
        return false;
      }

      const { data: template, error: templateError } = await supabase
        .from("contract_templates" as any)
        .select("id, nome, conteudo_html, template_type, template_structure")
        .eq("tenant_id", resolvedTenantId)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (templateError) {
        console.warn("[CloseSaleFlow] Template fetch error:", templateError.message);
        logError({
          source: "close_sale_flow",
          message: templateError.message || "Falha ao buscar modelo de contrato",
          context: {
            step: "fetch_contract_template",
            client_id: effectiveClient.id,
            tenant_id: resolvedTenantId,
          },
        });
      }

      const templateHtml = (template as any)?.conteudo_html || DEFAULT_CONTRACT_TEMPLATE_HTML;
      if (!(template as any)?.conteudo_html) {
        console.warn("[CloseSaleFlow] No active template found, using default");
        toast.warning("Nenhum modelo ativo foi encontrado; abrindo o editor com um modelo padrão.", { duration: 7000 });
        logEvent({
          event_type: "integration",
          source: "close_sale_flow",
          message: "Editor aberto com modelo padrão por ausência de template ativo",
          metadata: {
            client_id: effectiveClient.id,
            tenant_id: resolvedTenantId,
            simulation_id: simulationId,
          },
        });
      }

      // Fetch company phones and active promotions for contract variables
      const [phonesResult, promosResult] = await Promise.all([
        (supabase as any)
          .from("company_useful_phones")
          .select("setor, responsavel, telefone")
          .eq("tenant_id", resolvedTenantId)
          .order("ordem", { ascending: true }),
        catalogProducts.length > 0
          ? (supabase as any)
              .from("product_promotions")
              .select("product_id, valor_promocional, validade, ativo")
              .eq("tenant_id", resolvedTenantId)
              .eq("ativo", true)
              .in("product_id", catalogProducts.map(cp => cp.product.id))
          : Promise.resolve({ data: [] }),
      ]);

      const companyPhones = phonesResult.data;
      const activePromos = (promosResult.data || []) as any[];
      const promoMap = new Map<string, number>();
      for (const p of activePromos) {
        const validade = new Date(p.validade);
        if (validade > new Date()) {
          promoMap.set(p.product_id, Number(p.valor_promocional));
        }
      }

      const html = buildContractHtml(templateHtml, {
        formData,
        client: effectiveClient,
        valorTela,
        result,
        formaPagamento,
        parcelas,
        valorEntrada,
        settings,
        selectedIndicador,
        comissaoPercentual,
        items,
        itemDetails,
        catalogProducts: catalogProducts.map(cp => ({
          name: cp.product.name,
          internal_code: cp.product.internal_code,
          quantity: cp.quantity,
          sale_price: promoMap.get(cp.product.id) ?? cp.product.sale_price,
        })),
        companyPhones: (companyPhones as any[]) || [],
      });

      setPendingSimId(simulationId);
      setPendingTemplateId((template as any)?.id ?? null);
      setContractHtml(html);
      setCloseSaleModalOpen(false);
      setClosingSale(false);
      // Use requestAnimationFrame to ensure modal unmounts before editor opens
      requestAnimationFrame(() => {
        setContractEditorOpen(true);
      });
      toast.success("Simulação salva! Abrindo editor do contrato...");
      logEvent({
        event_type: "integration",
        source: "close_sale_flow",
        message: "Fluxo avançou para o editor do contrato",
        metadata: {
          client_id: effectiveClient.id,
          tenant_id: resolvedTenantId,
          simulation_id: simulationId,
          template_id: (template as any)?.id ?? null,
        },
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao preparar o contrato.";
      console.error("[CloseSaleFlow] Error:", err);
      toast.error(`O contrato não pôde continuar: ${message}`, { duration: 7000 });
      logError({
        source: "close_sale_flow",
        message,
        context: {
          step: "prepare_contract_editor",
          client_id: effectiveClient.id,
          tenant_id: resolvedTenantId,
        },
      });
      return false;
    } finally {
      setClosingSale(false);
    }
  }, [handleSave, effectiveClient, resolvedTenantId, valorTela, result, formaPagamento, parcelas, valorEntrada, settings, selectedIndicador, comissaoPercentual, catalogProducts]);

  const handleContractSave = useCallback(async (finalHtml: string): Promise<string | null> => {
    if (!effectiveClient) {
      reportCloseSaleIssue("O contrato não pôde ser salvo porque o cliente vinculado não foi encontrado.", { step: "save_contract" });
      return null;
    }
    if (!pendingSimId) {
      reportCloseSaleIssue("O contrato não pôde ser salvo porque a simulação vinculada não foi encontrada.", { step: "save_contract", reason: "missing_simulation_id" });
      return null;
    }
    setClosingSale(true);
    try {
      const formDataPayload = closeSaleFormData ? {
        form: closeSaleFormData,
        items: closeSaleItems,
        itemDetails: closeSaleItemDetails,
      } : null;

      // Build complete snapshot for legal integrity
      const snapshot = {
        formData: closeSaleFormData || {},
        items: closeSaleItems || [],
        itemDetails: closeSaleItemDetails || [],
        valores: {
          valorTela,
          desconto1, desconto2, desconto3,
          formaPagamento,
          parcelas,
          valorEntrada,
          plusPercentual,
          valorFinal: result.valorFinal,
          valorParcela: result.valorParcela,
          valorComDesconto: result.valorComDesconto,
          saldo: result.saldo,
          taxaCredito: result.taxaCredito,
        },
        cliente: {
          id: effectiveClient.id,
          nome: effectiveClient.nome,
          cpf: effectiveClient.cpf,
          email: effectiveClient.email,
          telefone1: effectiveClient.telefone1,
        },
        catalogProducts: catalogProducts.map(cp => ({
          name: cp.product.name,
          internal_code: cp.product.internal_code,
          quantity: cp.quantity,
          sale_price: cp.product.sale_price,
        })),
        environments: environments.map(env => ({
          environmentName: env.environmentName,
          pieceCount: env.pieceCount,
          totalValue: env.totalValue,
          fornecedor: env.fornecedor,
          corpo: env.corpo,
          porta: env.porta,
          puxador: env.puxador,
        })),
        gerado_em: new Date().toISOString(),
        simulation_id: pendingSimId,
        template_id: pendingTemplateId,
      };

      const { data: insertedData, error: contractError } = await supabase.from("client_contracts").insert({
        client_id: effectiveClient.id, simulation_id: pendingSimId, template_id: pendingTemplateId,
        conteudo_html: finalHtml,
        snapshot,
        ...(formDataPayload ? { form_data: formDataPayload } : {}),
        ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
      } as any).select("id").single();

      if (contractError || !insertedData) {
        const message = contractError?.message
          ? `Não foi possível salvar o contrato: ${contractError.message}`
          : "Não foi possível salvar o contrato.";
        toast.error(message, { duration: 7000 });
        logError({
          source: "close_sale_flow",
          message: contractError?.message || "Erro ao salvar contrato",
          context: { step: "insert_client_contract", client_id: effectiveClient.id, simulation_id: pendingSimId, tenant_id: resolvedTenantId },
        });
        return null;
      }

      const contractId = (insertedData as any).id as string;
      const formDataFechamento = closeSaleFormData?.data_fechamento
        ? new Date(closeSaleFormData.data_fechamento + "T12:00:00").toISOString()
        : new Date().toISOString();

      await supabase.from("clients").update({
        status: "fechado",
        data_contrato: formDataFechamento,
      } as any).eq("id", effectiveClient.id);

      try {
        const valorAVista = applyDiscounts(valorTelaComComissao, desconto1, desconto2, desconto3);
        const commResult = await generateSaleCommissions({
          clientId: effectiveClient.id, clientName: effectiveClient.nome, valorAVista,
          contratoNumero: closeSaleFormData?.numero_contrato || effectiveClient.numero_orcamento || "",
          responsavelVenda: closeSaleFormData?.responsavel_venda || effectiveClient.vendedor || "",
          selectedIndicador, comissaoPercentual,
        });
        if (commResult.error) toast.error(commResult.error);
        else if (commResult.count > 0) toast.success(`${commResult.count} comissão(ões) gerada(s) automaticamente`);
      } catch {}

      try {
        if (resolvedTenantId) {
          await recordSale(resolvedTenantId, {
            valor_venda: result.valorFinal, client_id: effectiveClient.id, usuario_id: currentUser?.id,
            simulation_id: pendingSimId, forma_pagamento: formaPagamento,
            numero_contrato: closeSaleFormData?.numero_contrato || "",
            nome_cliente: effectiveClient.nome, nome_vendedor: currentUser?.nome_completo || currentUser?.apelido || "",
          });
        }
      } catch {}

      // Record stock movements (saída) for catalog products
      if (resolvedTenantId && catalogProducts.length > 0) {
        try {
          for (const cp of catalogProducts) {
            const stockQty = cp.product.stock_quantity ?? 0;
            const newQty = Math.max(0, stockQty - cp.quantity);

            // Update product stock
            await supabase
              .from("products" as any)
              .update({ stock_quantity: newQty } as any)
              .eq("id", cp.product.id);

            // Record movement
            await recordStockMovement({
              tenant_id: resolvedTenantId,
              product_id: cp.product.id,
              user_id: currentUser?.id,
              type: "saida",
              quantity: cp.quantity,
              previous_quantity: stockQty,
              new_quantity: newQty,
              reason: `Venda fechada - Cliente: ${effectiveClient.nome}`,
              reference_id: contractId,
            });
          }
        } catch (stockErr) {
          console.warn("[CloseSaleFlow] Stock movement error:", stockErr);
        }
      }

      const userInfo = getAuditUserInfo();
      logAudit({ acao: "venda_fechada", entidade: "contract", entidade_id: pendingSimId, detalhes: { cliente: effectiveClient.nome, cliente_id: effectiveClient.id, valor_final: result.valorFinal, forma_pagamento: formaPagamento }, ...userInfo });

      try {
        const quantidadeAmbientes = Math.max(
          closeSaleItems?.length || 0,
          closeSaleItemDetails?.length || 0,
          environments?.length || 0,
          Number(effectiveClient.quantidade_ambientes) || 0,
        );
        const numeroContrato = closeSaleFormData?.numero_contrato || effectiveClient.numero_orcamento || "";
        const projetista = closeSaleFormData?.responsavel_venda || currentUser?.nome_completo || currentUser?.apelido || effectiveClient.vendedor || null;

        if (resolvedTenantId && numeroContrato) {
          const { data: existingTracking } = await supabase
            .from("client_tracking")
            .select("id")
            .eq("tenant_id", resolvedTenantId)
            .eq("client_id", effectiveClient.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const trackingPayload = {
            contract_id: contractId,
            client_id: effectiveClient.id,
            tenant_id: resolvedTenantId,
            numero_contrato: numeroContrato,
            nome_cliente: effectiveClient.nome || closeSaleFormData?.nome_cliente || "Cliente",
            cpf_cnpj: effectiveClient.cpf || null,
            quantidade_ambientes: quantidadeAmbientes,
            valor_contrato: Number(result.valorFinal) || 0,
            data_fechamento: formDataFechamento,
            projetista,
            status: "medicao",
          } as any;

          if (existingTracking?.id) {
            await supabase.from("client_tracking").update(trackingPayload).eq("id", existingTracking.id);
          } else {
            await supabase.from("client_tracking").insert(trackingPayload);
          }
        }
      } catch {}

      try {
        const totalDiscPct = 100 - (result.valorFinal / (valorTela || 1)) * 100;
        const table = supabase.from("ai_learning_events" as unknown as "clients");
        void (table as unknown as { insert: (rows: unknown[]) => Promise<unknown> })
          .insert([{ tenant_id: resolvedTenantId, user_id: currentUser?.id || null, client_id: effectiveClient.id, event_type: "deal_closed", strategy_used: "outro", price_offered: result.valorFinal, discount_percentage: Math.max(0, totalDiscPct), deal_result: "ganho", lead_temperature: effectiveClient.status || "novo" }]);
      } catch {}

      // Smart Catalog: subtract stock or create purchase task for admin
      if (catalogProducts.length > 0 && resolvedTenantId) {
        try {
          for (const cp of catalogProducts) {
            const { data: productData } = await (supabase as any)
              .from("products")
              .select("id, stock_quantity, supplier_id")
              .eq("id", cp.product.id)
              .single();
            if (!productData) continue;

            const currentStock = Number(productData.stock_quantity) || 0;
            if (currentStock >= cp.quantity) {
              const newStock = currentStock - cp.quantity;
              await (supabase as any).from("products").update({
                stock_quantity: newStock,
                stock_status: newStock === 0 ? "indisponivel" : newStock <= 3 ? "sob_encomenda" : "em_estoque",
              }).eq("id", cp.product.id);
            } else {
              const { data: adminUsers } = await supabase
                .from("usuarios" as any)
                .select("id, nome_completo, cargos:cargo_id(nome)")
                .eq("tenant_id", resolvedTenantId);

              const admins = (adminUsers || []).filter((u: any) => {
                const cargoName = u.cargos?.nome?.toLowerCase() || "";
                return cargoName.includes("administrador");
              });

              let supplierName = "Não informado";
              if (productData.supplier_id) {
                const { data: supplierData } = await supabase
                  .from("suppliers" as any)
                  .select("nome")
                  .eq("id", productData.supplier_id)
                  .single();
                if (supplierData) supplierName = (supplierData as any).nome;
              }

              const qtdFaltante = cp.quantity - currentStock;
              const dataVenda = new Date().toLocaleDateString("pt-BR");
              const taskDesc = [
                `🛒 **Compra necessária**`,
                `• Cliente: ${effectiveClient.nome}`,
                `• Contrato: ${closeSaleFormData?.numero_contrato || "N/A"}`,
                `• Data da Venda: ${dataVenda}`,
                `• Produto: ${cp.product.name} (${cp.product.internal_code})`,
                `• Qtd vendida: ${cp.quantity} | Em estoque: ${currentStock} | Faltam: ${qtdFaltante}`,
                `• Valor unitário: ${formatCurrency(cp.product.sale_price)}`,
                `• Valor total: ${formatCurrency(cp.product.sale_price * cp.quantity)}`,
                `• Fornecedor: ${supplierName}`,
                `[product_id:${cp.product.id}]`,
              ].join("\n");

              if (currentStock > 0) {
                await (supabase as any).from("products").update({
                  stock_quantity: 0,
                  stock_status: "indisponivel",
                }).eq("id", cp.product.id);
              }

              for (const admin of admins) {
                await (supabase as any).from("tasks").insert({
                  tenant_id: resolvedTenantId,
                  titulo: `Compra: ${cp.product.name} (${cp.product.internal_code})`,
                  descricao: taskDesc,
                  data_tarefa: new Date().toISOString().slice(0, 10),
                  tipo: "geral",
                  status: "nova",
                  responsavel_id: (admin as any).id,
                  responsavel_nome: (admin as any).nome_completo,
                  criado_por: currentUser?.id || null,
                });
              }
            }
          }
        } catch (err) {
          console.error("[SmartCatalog] Erro ao processar estoque:", err);
        }
      }

      logEvent({
        event_type: "integration",
        source: "close_sale_flow",
        message: "Contrato salvo e fluxo de fechamento concluído",
        metadata: { client_id: effectiveClient.id, simulation_id: pendingSimId, tenant_id: resolvedTenantId },
      });

      // Clear persisted form data for this client after successful contract save
      try {
        sessionStorage.removeItem(`form_persist_close-sale-form-${effectiveClient.id}`);
      } catch {}

      return contractId;
    } finally {
      setClosingSale(false);
    }
  }, [effectiveClient, pendingSimId, pendingTemplateId, resolvedTenantId, valorTela, valorTelaComComissao, desconto1, desconto2, desconto3, result, formaPagamento, parcelas, valorEntrada, settings, selectedIndicador, comissaoPercentual, closeSaleFormData, closeSaleItems, closeSaleItemDetails, currentUser, recordSale, catalogProducts, environments]);

  const handlePdf = useCallback(async (): Promise<string | null> => {
    if (!effectiveClient || !resolvedTenantId) { toast.error("Tenant não identificado"); return null; }
    setGeneratingPdf(true);
    try {
      const pdfResult = await generateBudgetPdfServerSide(resolvedTenantId, {
        clientName: effectiveClient.nome, clientCpf: effectiveClient.cpf || undefined,
        clientEmail: effectiveClient.email || undefined, clientPhone: effectiveClient.telefone1 || undefined,
        vendedor: effectiveClient.vendedor || undefined, companyName: settings.company_name,
        companySubtitle: settings.company_subtitle || undefined, companyLogoUrl: settings.logo_url || undefined,
        valorTela, desconto1, desconto2, desconto3, valorComDesconto: result.valorComDesconto,
        formaPagamento, parcelas, valorEntrada, plusPercentual, taxaCredito: result.taxaCredito,
        saldo: result.saldo, valorFinal: result.valorFinal, valorParcela: result.valorParcela,
        ambientes: environments.map(e => ({ environmentName: e.environmentName, pieceCount: e.pieceCount, totalValue: e.totalValue })),
        catalogProducts: catalogProducts.map(cp => ({ name: cp.product.name, internal_code: cp.product.internal_code, quantity: cp.quantity, sale_price: cp.product.sale_price })),
      });
      if (!pdfResult.success || !pdfResult.download_url) {
        toast.error(pdfResult.error || "Erro ao gerar PDF");
        return null;
      }
      toast.success("PDF gerado com sucesso!");
      return pdfResult.download_url;
    } finally { setGeneratingPdf(false); }
  }, [effectiveClient, resolvedTenantId, settings, valorTela, desconto1, desconto2, desconto3, result, formaPagamento, parcelas, valorEntrada, plusPercentual, environments, catalogProducts]);

  return {
    saving, generatingPdf, closingSale, savedRef, techFieldsHighlight,
    contractEditorOpen, setContractEditorOpen,
    contractHtml, pendingSimId, setPendingSimId,
    pendingTemplateId, setPendingTemplateId,
    closeSaleModalOpen, setCloseSaleModalOpen,
    closeSaleFormData, savedContractFormData,
    upgradeOpen, setUpgradeOpen, upgradeMsg,
    handleSave, handleCloseSale, handleCloseSaleConfirm, handleContractSave,
    handleFileImport, handleRemoveEnvironment, handlePdf,
    VALOR_TELA_MAX,
  };
}
