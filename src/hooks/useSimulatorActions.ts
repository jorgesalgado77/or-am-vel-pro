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
import { validateFileUpload } from "@/lib/validation";
import { parseProjectFile } from "@/services/fileImportService";
import { formatCurrency, type FormaPagamento, type SimulationInput, calculateSimulation } from "@/lib/financing";
import type { ImportedEnvironment } from "@/components/simulator/SimulatorEnvironmentsTable";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const SIM_STORAGE_KEY = "simulator_state";

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
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState("");
  const savedRef = useRef(false);

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
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          if (!content) return;
          const parsed = parseProjectFile(content, file.name);
          const hasTotal = parsed.total !== null && !isNaN(parsed.total) && parsed.total > 0;
          setEnvironments((prev) => [...prev, {
            id: crypto.randomUUID(), fileName: file.name, environmentName: parsed.envName,
            pieceCount: parsed.pieces, totalValue: hasTotal ? parsed.total : 0, importedAt: new Date(), file,
            fornecedor: parsed.fornecedor || "", corpo: parsed.corpo || "", porta: parsed.porta || "",
            puxador: parsed.puxador || "", complemento: parsed.complemento || "", modelo: parsed.modelo || "",
            fileFormat: parsed.fileFormat,
          }]);
          setImportedFile(file);
          if (parsed.software && parsed.software !== "generico") setDetectedSoftware(parsed.software);
          if (hasTotal) {
            toast.success(`Ambiente "${parsed.envName}" importado: ${formatCurrency(parsed.total)}`);
          } else {
            toast.warning(`Ambiente "${parsed.envName}" importado sem valor total. Preencha manualmente.`);
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

  const handleSave = useCallback(async () => {
    if (valorTela <= 0) { toast.error("Informe um Valor de Tela maior que zero"); return null; }
    if (valorTela > VALOR_TELA_MAX) { toast.error(`Valor de Tela não pode exceder ${formatCurrency(VALOR_TELA_MAX)}`); return null; }
    if (valorEntrada < 0) { toast.error("Valor de Entrada não pode ser negativo"); return null; }
    if (valorEntrada > result.valorComDesconto) { toast.error("Valor de Entrada não pode ser maior que o valor com desconto"); return null; }

    const discountCheck = checkDiscount(valorTelaComComissao, desconto1, desconto2, desconto3, plusPercentual);
    if (!discountCheck.allowed) {
      const valorDesc = valorTelaComComissao * (1 - desconto1 / 100) * (1 - desconto2 / 100) * (1 - desconto3 / 100);
      const discPct = valorTelaComComissao > 0 ? ((valorTelaComComissao - valorDesc) / valorTelaComComissao) * 100 : 0;
      await requestApproval({
        clientName: client?.nome || newClient.nome || "Novo cliente",
        vendedorName: currentUser?.nome_completo || currentUser?.apelido || "Vendedor",
        valorFinal: result.valorFinal, discountPercent: discPct, violations: discountCheck.violations,
      });
      return null;
    }

    let clientId = client?.id;
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
      if (clientError || !created) { toast.error("Erro ao cadastrar cliente"); setSaving(false); return null; }
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
      if (limitMsg) { setUpgradeMsg(limitMsg); setUpgradeOpen(true); }
      else toast.error("Erro ao salvar simulação");
      return null;
    }

    savedRef.current = true;
    sessionStorage.removeItem(SIM_STORAGE_KEY);
    toast.success("Simulação salva com sucesso!");
    const userInfo = getAuditUserInfo();
    logAudit({ acao: "simulacao_salva", entidade: "simulation", entidade_id: clientId, detalhes: { valor_tela: valorTela, valor_final: result.valorFinal, forma_pagamento: formaPagamento, desconto1, desconto2, desconto3, valor_entrada: valorEntrada, ia_ativa: !!aiStrategyEnabled, estrategia_ia: aiStrategyEnabled ? (activeStrategy || null) : null }, ...userInfo });

    if (resolvedTenantId) {
      const totalDiscount = 100 - (100 * (1 - desconto1 / 100) * (1 - desconto2 / 100) * (1 - desconto3 / 100));
      void supabase.from("ai_learning_events" as unknown as "clients")
        .insert([{ tenant_id: resolvedTenantId, user_id: currentUser?.id || null, client_id: clientId, event_type: "proposal_sent", price_offered: result.valorFinal, discount_percentage: Math.round(totalDiscount * 100) / 100, strategy_used: aiStrategyEnabled ? (activeStrategy || "consultiva") : "consultiva", metadata: { valor_tela: valorTela, forma_pagamento: formaPagamento, parcelas, valor_entrada: valorEntrada } } as any])
        .then(({ error: learnErr }) => { if (learnErr) console.warn("[Simulator] learning event error:", learnErr); });
    }
    if (!client) {
      setShowClientForm(false);
      setNewClient({ nome: "", cpf: "", telefone1: "", telefone2: "", email: "", vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "" });
    }

    return createdSimulation.id;
  }, [valorTela, valorEntrada, valorTelaComComissao, desconto1, desconto2, desconto3, plusPercentual, formaPagamento, parcelas, result, client, newClient, showClientForm, environments, catalogProducts, resolvedTenantId, currentUser, checkDiscount, requestApproval, onClientCreated, setShowClientForm, setNewClient, activeStrategy, aiStrategyEnabled]);

  const REQUIRED_TECH_KEYS: (keyof ImportedEnvironment)[] = ["corpo", "porta", "puxador", "fornecedor"];
  const [techFieldsHighlight, setTechFieldsHighlight] = useState(false);

  const handleCloseSale = useCallback(async () => {
    if (!client) { toast.error("Selecione um cliente para fechar a venda"); return; }
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
    try {
      if (resolvedTenantId) {
        const accessResult = await validateAccess(resolvedTenantId);
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
  }, [client, resolvedTenantId, validateAccess, environments]);

  const handleCloseSaleConfirm = useCallback(async (formData: any, items: any[], itemDetails: any[]) => {
    setCloseSaleFormData(formData);
    setCloseSaleItems(items);
    setCloseSaleItemDetails(itemDetails);
    setClosingSale(true);
    try {
      const simulationId = await handleSave();
      if (!simulationId) return;

      const { data: template, error: templateError } = await supabase
        .from("contract_templates" as any)
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (templateError || !template) {
        toast.error("Nenhum modelo de contrato ativo encontrado.");
        return;
      }

      const html = buildContractHtml((template as any).conteudo_html, {
        formData,
        client: client!,
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
        catalogProducts: catalogProducts.map(cp => ({ name: cp.product.name, internal_code: cp.product.internal_code, quantity: cp.quantity, sale_price: cp.product.sale_price })),
      });

      setPendingSimId(simulationId);
      setPendingTemplateId((template as any).id);
      setContractHtml(html);
      setCloseSaleModalOpen(false);
      setContractEditorOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao fechar venda");
    } finally {
      setClosingSale(false);
    }
  }, [handleSave, client, valorTela, result, formaPagamento, parcelas, valorEntrada, settings, selectedIndicador, comissaoPercentual, catalogProducts]);

  const handleContractConfirm = useCallback(async (finalHtml: string) => {
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
    } catch {}
    try {
      if (resolvedTenantId) {
        await recordSale(resolvedTenantId, {
          valor_venda: result.valorFinal, client_id: client.id, usuario_id: currentUser?.id,
          simulation_id: pendingSimId, forma_pagamento: formaPagamento,
          numero_contrato: closeSaleFormData?.numero_contrato || "",
          nome_cliente: client.nome, nome_vendedor: currentUser?.nome_completo || currentUser?.apelido || "",
        });
      }
    } catch {}
    openContractPrintWindow(finalHtml, `Contrato - ${client.nome}`);
    const userInfo = getAuditUserInfo();
    logAudit({ acao: "venda_fechada", entidade: "contract", entidade_id: pendingSimId, detalhes: { cliente: client.nome, cliente_id: client.id, valor_final: result.valorFinal, forma_pagamento: formaPagamento }, ...userInfo });
    try {
      const totalDiscPct = 100 - (result.valorFinal / (valorTela || 1)) * 100;
      const table = supabase.from("ai_learning_events" as unknown as "clients");
      void (table as unknown as { insert: (rows: unknown[]) => Promise<unknown> })
        .insert([{ tenant_id: resolvedTenantId, user_id: currentUser?.id || null, client_id: client.id, event_type: "deal_closed", strategy_used: "outro", price_offered: result.valorFinal, discount_percentage: Math.max(0, totalDiscPct), deal_result: "ganho", lead_temperature: client.status || "novo" }]);
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
            // Subtract sold quantity from stock
            const newStock = currentStock - cp.quantity;
            await (supabase as any).from("products").update({
              stock_quantity: newStock,
              stock_status: newStock === 0 ? "indisponivel" : newStock <= 3 ? "sob_encomenda" : "em_estoque",
            }).eq("id", cp.product.id);
          } else {
            // No sufficient stock: create purchase task for admin
            // Find admin users
            const { data: adminUsers } = await supabase
              .from("usuarios" as any)
              .select("id, nome_completo, cargos:cargo_id(nome)")
              .eq("tenant_id", resolvedTenantId);

            const admins = (adminUsers || []).filter((u: any) => {
              const cargoName = u.cargos?.nome?.toLowerCase() || "";
              return cargoName.includes("administrador");
            });

            // Get supplier name
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
              `• Cliente: ${client.nome}`,
              `• Contrato: ${closeSaleFormData?.numero_contrato || "N/A"}`,
              `• Data da Venda: ${dataVenda}`,
              `• Produto: ${cp.product.name} (${cp.product.internal_code})`,
              `• Qtd vendida: ${cp.quantity} | Em estoque: ${currentStock} | Faltam: ${qtdFaltante}`,
              `• Valor unitário: ${formatCurrency(cp.product.sale_price)}`,
              `• Valor total: ${formatCurrency(cp.product.sale_price * cp.quantity)}`,
              `• Fornecedor: ${supplierName}`,
              `[product_id:${cp.product.id}]`,
            ].join("\n");

            // If stock was partial, subtract what existed
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

    toast.success("Venda fechada! Contrato gerado, comissões criadas e salvo.");
    setContractEditorOpen(false); setPendingSimId(null); setPendingTemplateId(null); setClosingSale(false);
  }, [client, pendingSimId, pendingTemplateId, resolvedTenantId, valorTela, valorTelaComComissao, desconto1, desconto2, desconto3, result, formaPagamento, parcelas, valorEntrada, settings, selectedIndicador, comissaoPercentual, closeSaleFormData, currentUser, recordSale]);

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
    closeSaleFormData,
    upgradeOpen, setUpgradeOpen, upgradeMsg,
    handleSave, handleCloseSale, handleCloseSaleConfirm, handleContractConfirm,
    handleFileImport, handleRemoveEnvironment, handlePdf,
    VALOR_TELA_MAX,
  };
}
