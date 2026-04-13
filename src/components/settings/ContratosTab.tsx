import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Upload, Save, Trash2, Plus, FileText, Eye, Code, Info, Sparkles, ImageOff, Download, FolderInput, CheckCircle2, AlertTriangle, XCircle, Move, Grid3X3, PenTool } from "lucide-react";
import { Wand2 } from "lucide-react";
import { importContractFile, highlightSuggestedFields, removeHighlights } from "@/lib/contractImport";
import { replaceDetectedFieldsWithPlaceholders } from "@/lib/contractImport";
import { buildContractDocumentHtml } from "@/lib/contractDocument";
import { injectDragVariablesIntoHtml, applyVariablePositions, type VariablePosition } from "@/lib/contractDragVariables";
import { getTenantId } from "@/lib/tenantState";
import { VariableAutocomplete } from "./VariableAutocomplete";
import { VariableTooltip } from "./VariableTooltip";
import { PdfImportPreviewModal } from "./PdfImportPreviewModal";
import { EditorToolbar } from "./EditorToolbar";
import { ContractVisualEditor } from "./ContractVisualEditor";
import type { ImportedContractContent } from "@/lib/contractImport";

interface ContractTemplate {
  id: string;
  nome: string;
  conteudo_html: string;
  arquivo_original_url: string | null;
  arquivo_original_nome: string | null;
  ativo: boolean;
  created_at: string;
  template_structure?: any;
  template_type?: string;
}

const AVAILABLE_VARIABLES = [
  { var: "{{nome_cliente}}", desc: "Nome do cliente" },
  { var: "{{cpf_cliente}}", desc: "CPF/CNPJ do cliente" },
  { var: "{{rg_insc_estadual}}", desc: "RG / Insc. Estadual" },
  { var: "{{telefone_cliente}}", desc: "Telefone do cliente" },
  { var: "{{email_cliente}}", desc: "Email do cliente" },
  { var: "{{numero_orcamento}}", desc: "Nº do orçamento" },
  { var: "{{numero_contrato}}", desc: "Nº do contrato" },
  { var: "{{data_fechamento}}", desc: "Data de fechamento" },
  { var: "{{responsavel_venda}}", desc: "Responsável pela venda" },
  { var: "{{data_nascimento}}", desc: "Data de nascimento" },
  { var: "{{profissao}}", desc: "Profissão do cliente" },
  { var: "{{endereco}}", desc: "Endereço do cliente" },
  { var: "{{bairro}}", desc: "Bairro do cliente" },
  { var: "{{cidade}}", desc: "Cidade do cliente" },
  { var: "{{uf}}", desc: "UF do cliente" },
  { var: "{{cep}}", desc: "CEP do cliente" },
  { var: "{{endereco_entrega}}", desc: "Endereço de entrega" },
  { var: "{{bairro_entrega}}", desc: "Bairro de entrega" },
  { var: "{{cidade_entrega}}", desc: "Cidade de entrega" },
  { var: "{{uf_entrega}}", desc: "UF de entrega" },
  { var: "{{cep_entrega}}", desc: "CEP de entrega" },
  { var: "{{tipo_contrato}}", desc: "Tipo de contrato selecionado" },
  { var: "{{prazo_entrega}}", desc: "Prazo de entrega" },
  { var: "{{prazo_entrega_fornecedor}}", desc: "Prazo de entrega do fornecedor" },
  { var: "{{projetista}}", desc: "Projetista responsável" },
  { var: "{{valor_tela}}", desc: "Valor de tela" },
  { var: "{{valor_final}}", desc: "Valor final" },
  { var: "{{forma_pagamento}}", desc: "Forma de pagamento" },
  { var: "{{parcelas}}", desc: "Número de parcelas" },
  { var: "{{valor_parcela}}", desc: "Valor da parcela" },
  { var: "{{valor_entrada}}", desc: "Valor da entrada" },
  { var: "{{data_atual}}", desc: "Data atual" },
  { var: "{{empresa_nome}}", desc: "Nome da empresa/loja" },
  { var: "{{cnpj_loja}}", desc: "CNPJ da loja" },
  { var: "{{endereco_loja}}", desc: "Endereço da loja" },
  { var: "{{bairro_loja}}", desc: "Bairro da loja" },
  { var: "{{cidade_loja}}", desc: "Cidade da loja" },
  { var: "{{uf_loja}}", desc: "UF da loja" },
  { var: "{{cep_loja}}", desc: "CEP da loja" },
  { var: "{{telefone_loja}}", desc: "Telefone da loja" },
  { var: "{{email_loja}}", desc: "Email da loja" },
  { var: "{{indicador_nome}}", desc: "Nome do indicador" },
  { var: "{{indicador_comissao}}", desc: "Comissão do indicador (%)" },
  { var: "{{observacoes}}", desc: "Observações do contrato" },
  { var: "{{itens_tabela}}", desc: "Tabela de itens/ambientes" },
  { var: "{{itens_detalhes}}", desc: "Detalhes dos itens (materiais)" },
  { var: "{{total_ambientes}}", desc: "Total dos ambientes" },
  { var: "{{ambientes_prazos}}", desc: "Tabela automática: ambientes + prazos + fornecedores" },
  { var: "{{ambientes_prazos_lista}}", desc: "Lista automática: ambientes com prazos (formato texto)" },
  { var: "{{ambientes_detalhes_completos}}", desc: "Tabela completa: ambientes + técnico + prazos + valores" },
  { var: "{{quantidade_ambientes}}", desc: "Número total de ambientes" },
  { var: "{{produtos_catalogo}}", desc: "Tabela de produtos do catálogo" },
  { var: "{{prazo_entrega_ambiente_N}}", desc: "Prazo de entrega do ambiente N (ex: _1, _2...)" },
  { var: "{{nome_ambiente_N}}", desc: "Nome/descrição do ambiente N" },
  { var: "{{fornecedor_ambiente_N}}", desc: "Fornecedor do ambiente N" },
  { var: "{{valor_ambiente_N}}", desc: "Valor do ambiente N" },
  { var: "{{corpo_ambiente_N}}", desc: "Corpo do ambiente N" },
  { var: "{{porta_ambiente_N}}", desc: "Porta do ambiente N" },
  { var: "{{puxador_ambiente_N}}", desc: "Puxador do ambiente N" },
  { var: "{{complemento_ambiente_N}}", desc: "Complemento do ambiente N" },
  { var: "{{modelo_ambiente_N}}", desc: "Modelo do ambiente N" },
  { var: "{{valor_com_desconto}}", desc: "Valor com desconto aplicado" },
  { var: "{{percentual_desconto}}", desc: "Percentual de desconto (%)" },
  { var: "{{valor_desconto}}", desc: "Valor do desconto em R$" },
  { var: "{{valor_restante}}", desc: "Valor restante (total − entrada)" },
  { var: "{{condicoes_pagamento}}", desc: "Resumo completo das condições de pagamento" },
  { var: "{{garantia}}", desc: "Texto de garantia (do formulário)" },
  { var: "{{prazo_garantia}}", desc: "Prazo de garantia (do formulário)" },
  { var: "{{validade_proposta}}", desc: "Validade da proposta comercial" },
  { var: "{{data_entrega_prevista}}", desc: "Data prevista de entrega (calculada)" },
  { var: "{{valor_total_produtos}}", desc: "Valor total dos produtos do catálogo" },
  { var: "{{valor_total_ambientes}}", desc: "Valor total dos ambientes" },
  { var: "{{valor_por_extenso}}", desc: "Valor final por extenso" },
  { var: "{{telefones_uteis}}", desc: "Tabela de telefones úteis da empresa (setor, responsável, telefone)" },
  { var: "{{telefone_util_setor_N}}", desc: "Setor do telefone útil N (ex: _1, _2...)" },
  { var: "{{telefone_util_responsavel_N}}", desc: "Responsável do telefone útil N" },
  { var: "{{telefone_util_numero_N}}", desc: "Número do telefone útil N" },
  { var: "{{logo_empresa}}", desc: "Logo da empresa (imagem)" },
  { var: "{{empresa_subtitulo}}", desc: "Subtítulo/slogan da empresa" },
  { var: "{{complemento_entrega}}", desc: "Complemento do endereço de entrega" },
  { var: "{{ambientes_valores_tabela}}", desc: "Tabela automática: ambientes com valores" },
  { var: "{{ambientes_cores_tabela}}", desc: "Tabela automática: ambientes com cores e materiais" },
  { var: "{{produtos_catalogo_completo}}", desc: "Tabela completa de produtos do catálogo" },
  { var: "{{endereco_entrega_completo}}", desc: "Endereço de entrega completo (formatado)" },
  { var: "{{quantidade_produtos_catalogo}}", desc: "Quantidade de produtos do catálogo" },
  { var: "{{produto_catalogo_nome_N}}", desc: "Nome do produto do catálogo N (ex: _1, _2...)" },
  { var: "{{produto_catalogo_codigo_N}}", desc: "Código do produto do catálogo N" },
  { var: "{{produto_catalogo_qtd_N}}", desc: "Quantidade do produto do catálogo N" },
  { var: "{{produto_catalogo_valor_N}}", desc: "Valor unitário do produto do catálogo N" },
  { var: "{{produto_catalogo_subtotal_N}}", desc: "Subtotal do produto do catálogo N" },
  { var: "{{titulos_ambiente_N}}", desc: "Título/descrição do ambiente N" },
  { var: "{{quantidade_ambiente_N}}", desc: "Quantidade do ambiente N" },
  { var: "{{descricao_ambiente_N}}", desc: "Descrição do ambiente N" },
  { var: "{{logo_empresa_url}}", desc: "URL da logo da empresa" },
];

export function ContratosTab() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [nome, setNome] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [viewMode, setViewMode] = useState<"editor" | "preview">("editor");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [showHighlights, setShowHighlights] = useState(true);
  const [autoReplace, setAutoReplace] = useState(true);
  const [keepBackground, setKeepBackground] = useState(true);
  const [pdfPreview, setPdfPreview] = useState<{
    imported: ImportedContractContent;
    processedHtml: string;
    replacements: Array<{ variable: string; label: string; originalValue: string }>;
    replacedCount: number;
    fileName: string;
  } | null>(null);
  const [savingImport, setSavingImport] = useState(false);
  const [dragMode, setDragMode] = useState(false);
  const [varPositions, setVarPositions] = useState<VariablePosition[]>([]);
  const [gridSize, setGridSize] = useState(8);
  const [isDraggingPaletteVariable, setIsDraggingPaletteVariable] = useState(false);
  const [isPreviewDropActive, setIsPreviewDropActive] = useState(false);
  const [visualEditorMode, setVisualEditorMode] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for drag position changes from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'variable-position-change') {
        const pos = e.data as VariablePosition & { type: string };
        setVarPositions((prev) => {
          const idx = prev.findIndex((p) => p.idx === pos.idx);
          const updated = { idx: pos.idx, varText: pos.varText, left: pos.left, top: pos.top, width: pos.width, height: pos.height };
          if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
          return [...prev, updated];
        });
      } else if (e.data?.type === 'all-variable-positions') {
        setVarPositions(e.data.positions);
      } else if (e.data?.type === 'variable-dropped') {
        const pos = e.data;
        setVarPositions((prev) => [...prev, { idx: pos.idx, varText: pos.varText, left: pos.left, top: pos.top, width: pos.width, height: pos.height }]);
        // Don't update htmlContent here to avoid iframe re-render which resets all positions
      } else if (e.data?.type === 'variable-removed') {
        const removedIdx = e.data.idx;
        setVarPositions((prev) => prev.filter((p) => p.idx !== removedIdx));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleToggleDragMode = () => {
    if (dragMode && varPositions.length > 0) {
      setHtmlContent((prev) => applyVariablePositions(prev, varPositions));
      setVarPositions([]);
      setEditorKey((k) => k + 1);
      toast.success("Posições das variáveis aplicadas!");
    }
    setIsDraggingPaletteVariable(false);
    setIsPreviewDropActive(false);
    setDragMode(!dragMode);
    if (!dragMode) {
      // Switch to preview when entering drag mode
      if (viewMode === "editor" && editorRef.current) {
        setHtmlContent(editorRef.current.innerHTML);
      }
      setViewMode("preview");
    }
  };

  const previewDocument = useMemo(() => {
    const base = buildContractDocumentHtml(removeHighlights(htmlContent), nome || "Preview do contrato");
    return dragMode ? injectDragVariablesIntoHtml(base, gridSize, AVAILABLE_VARIABLES) : base;
  }, [htmlContent, nome, dragMode, gridSize],
  );

  // Send grid size changes to iframe
  useEffect(() => {
    if (dragMode && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'set-grid-size', gridSize }, '*');
    }
  }, [gridSize, dragMode]);

  const variableReport = useMemo(() => {
    const cleanHtml = removeHighlights(htmlContent);
    const knownVars = new Set(AVAILABLE_VARIABLES.map((v) => v.var));
    const matches = cleanHtml.match(/\{\{[^}]+\}\}/g) || [];
    const usedSet = new Set(matches);
    const used = AVAILABLE_VARIABLES.filter((v) => usedSet.has(v.var));
    const missing = AVAILABLE_VARIABLES.filter((v) => !usedSet.has(v.var));
    const unknown = [...usedSet].filter((v) => !knownVars.has(v));
    return { used, missing, unknown, total: AVAILABLE_VARIABLES.length };
  }, [htmlContent]);

  const fetchTemplates = async () => {
    const tenantId = getTenantId();
    let query = supabase
      .from("contract_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    setTemplates((data as ContractTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleNew = () => {
    setEditingTemplate(null);
    setNome("Novo Contrato");
    setHtmlContent(DEFAULT_CONTRACT_HTML);
    setViewMode("editor");
    setEditorKey((k) => k + 1);
  };

  const handleEdit = (t: ContractTemplate) => {
    setEditingTemplate(t);
    setNome(t.nome);
    setHtmlContent(t.conteudo_html);
    setViewMode("editor");
    setEditorKey((k) => k + 1);
  };

  const getCleanHtml = () => {
    let raw = htmlContent;
    if (viewMode === "editor" && editorRef.current) {
      raw = editorRef.current.innerHTML;
    }
    return removeHighlights(raw);
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do contrato");
      return;
    }
    setSaving(true);

    const finalHtml = getCleanHtml();
    setHtmlContent(finalHtml);

    if (editingTemplate) {
      const updatePayload: Record<string, any> = { nome, conteudo_html: finalHtml };
      if (editingTemplate.template_structure) {
        updatePayload.template_structure = editingTemplate.template_structure;
        updatePayload.template_type = editingTemplate.template_type || "flow";
      }
      const { error } = await supabase
        .from("contract_templates")
        .update(updatePayload as never)
        .eq("id", editingTemplate.id);
      if (error) toast.error("Erro ao salvar");
      else toast.success("Contrato atualizado!");
    } else {
      const tenantId = getTenantId();
      const insertPayload: Record<string, any> = {
        nome,
        conteudo_html: finalHtml,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      };
      if ((editingTemplate as any)?.template_structure) {
        insertPayload.template_structure = (editingTemplate as any).template_structure;
        insertPayload.template_type = (editingTemplate as any).template_type || "flow";
      }
      const { error } = await supabase
        .from("contract_templates")
        .insert(insertPayload as never);
      if (error) toast.error("Erro ao criar");
      else toast.success("Contrato criado!");
    }
    setSaving(false);
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este modelo de contrato?")) return;
    const tenantId = getTenantId();
    const linkedContractsQuery = supabase
      .from("client_contracts")
      .select("id", { count: "exact", head: true })
      .eq("template_id", id);

    const { count: linkedContractsCount, error: linkedContractsError } = tenantId
      ? await linkedContractsQuery.eq("tenant_id", tenantId)
      : await linkedContractsQuery;

    if (linkedContractsError) {
      console.error("Erro ao verificar vínculos do modelo:", linkedContractsError);
      toast.error("Não foi possível verificar vínculos deste modelo");
      return;
    }

    if ((linkedContractsCount || 0) > 0) {
      const { error: unlinkError } = await (tenantId
        ? supabase
            .from("client_contracts")
            .update({ template_id: null } as never)
            .eq("template_id", id)
            .eq("tenant_id", tenantId)
        : supabase
            .from("client_contracts")
            .update({ template_id: null } as never)
            .eq("template_id", id));

      if (unlinkError) {
        console.error("Erro ao desvincular contratos do modelo:", unlinkError);
        toast.error("Erro ao desvincular contratos ligados a este modelo");
        return;
      }
    }

    let query = supabase.from("contract_templates").delete().eq("id", id);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { error } = await query;
    if (error) {
      console.error("Erro ao excluir:", error);
      toast.error(error.message || "Erro ao excluir modelo");
      return;
    }
    // Immediately remove from local state
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success("Modelo excluído!");
    if (editingTemplate?.id === id) {
      setEditingTemplate(null);
      setHtmlContent("");
      setNome("");
    }
  };

  // ── Export template as JSON file ──
  const handleExportTemplate = (t: ContractTemplate) => {
    const exportData = {
      _format: "orcamovel_contract_template_v1",
      nome: t.nome,
      conteudo_html: t.conteudo_html,
      template_structure: t.template_structure || null,
      template_type: t.template_type || "flow",
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.nome.replace(/[^a-zA-Z0-9À-ú_-]/g, "_")}.template.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template exportado!");
  };

  // ── Import template from JSON or PDF file ──
  const handleImportTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();

    // PDF/DOCX import — extract, auto-replace variables, show preview modal
    if (extension === "pdf" || extension === "docx") {
      setImporting(true);
      setImportProgress("Iniciando importação...");
      try {
        const imported = await importContractFile(file, (info) => {
          setImportProgress(info.label);
        });
        const result = replaceDetectedFieldsWithPlaceholders(imported.html);

        setPdfPreview({
          imported,
          processedHtml: result.html,
          replacements: result.replacements.map((r) => ({
            variable: r.variable,
            label: r.label,
            originalValue: r.originalValue,
          })),
          replacedCount: result.replacedCount,
          fileName: file.name,
        });
        toast.dismiss();
        setImportProgress("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao importar arquivo";
        toast.error(message);
        console.error("[Import Template Error]", err);
      } finally {
        setImporting(false);
        setImportProgress("");
        e.target.value = "";
      }
      return;
    }

    // JSON import (existing logic)
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data._format !== "orcamovel_contract_template_v1") {
        toast.error("Arquivo inválido. Use um template exportado pelo sistema ou PDF.");
        return;
      }

      // Validate variables used in the template
      const knownVars = new Set(AVAILABLE_VARIABLES.map((v) => v.var));
      const htmlContent = data.conteudo_html || "";
      const usedVars = htmlContent.match(/\{\{[^}]+\}\}/g) || [];
      const uniqueUsed = [...new Set(usedVars)];
      const unknown = uniqueUsed.filter((v: string) => !knownVars.has(v) && !/\{\{.*ambiente_\d+\}\}/.test(v));

      if (unknown.length > 0) {
        const proceed = confirm(
          `O template contém ${unknown.length} variável(is) não reconhecida(s):\n\n${unknown.join(", ")}\n\nDeseja importar mesmo assim?`
        );
        if (!proceed) return;
      }

      const tenantId = getTenantId();
      const insertPayload: Record<string, any> = {
        nome: data.nome || "Template Importado",
        conteudo_html: htmlContent,
        ativo: true,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      };
      if (data.template_structure) {
        insertPayload.template_structure = data.template_structure;
        insertPayload.template_type = data.template_type || "flow";
      }

      const { error } = await supabase
        .from("contract_templates")
        .insert(insertPayload as never);

      if (error) {
        toast.error("Erro ao importar template: " + error.message);
      } else {
        toast.success(`Template "${data.nome}" importado com sucesso!`);
        fetchTemplates();
      }
    } catch (err) {
      toast.error("Erro ao ler arquivo");
      console.error(err);
    } finally {
      e.target.value = "";
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress("Iniciando importação...");

    try {
      const imported = await importContractFile(file, (info) => {
        setImportProgress(info.label);
      });
      let processedHtml = imported.html;
      let replacedCount = 0;

      if (autoReplace) {
        const result = replaceDetectedFieldsWithPlaceholders(processedHtml);
        processedHtml = result.html;
        replacedCount = result.replacedCount;
      }

      const highlighted = showHighlights ? highlightSuggestedFields(processedHtml) : processedHtml;

      setHtmlContent(highlighted);
      setViewMode("editor");
      setEditorKey((k) => k + 1);

      // Store structure metadata on the editing template for save
      if (imported.structure || imported.templateType) {
        setEditingTemplate((prev) => ({
          ...(prev || { id: "", nome: "", conteudo_html: "", arquivo_original_url: null, arquivo_original_nome: null, ativo: true, created_at: "" }),
          template_structure: imported.structure || null,
          template_type: imported.templateType || "flow",
        } as ContractTemplate));
      }

      if (!nome || nome === "Novo Contrato") {
        setNome(imported.suggestedName);
      }

      const replaceMsg = replacedCount > 0 ? ` — ${replacedCount} campo(s) convertido(s) em variáveis` : "";
      const typeMsg = imported.templateType === "hybrid" ? " (layout pixel-perfect)" : "";
      toast.success(`${imported.sourceLabel} importado e carregado para edição!${replaceMsg}${typeMsg}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao importar arquivo";
      toast.error(message);
      console.error(err);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const toggleHighlights = () => {
    const newVal = !showHighlights;
    setShowHighlights(newVal);

    let currentHtml = htmlContent;
    if (viewMode === "editor" && editorRef.current) {
      currentHtml = editorRef.current.innerHTML;
    }

    if (newVal) {
      const clean = removeHighlights(currentHtml);
      const highlighted = highlightSuggestedFields(clean);
      setHtmlContent(highlighted);
    } else {
      setHtmlContent(removeHighlights(currentHtml));
    }
    setEditorKey((k) => k + 1);
  };

  const insertVariable = (varName: string) => {
    if (viewMode === "editor" && editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorRef.current.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          const textNode = document.createTextNode(varName);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
      }
      editorRef.current.innerHTML += varName;
    } else {
      setHtmlContent((prev) => prev + varName);
    }
  };

  const handleConfirmPdfImport = async (data: {
    nome: string;
    html: string;
    structure?: any;
    templateType?: string;
    fileName: string;
  }) => {
    setSavingImport(true);
    try {
      const tenantId = getTenantId();
      const insertPayload: Record<string, any> = {
        nome: data.nome,
        conteudo_html: data.html,
        ativo: true,
        arquivo_original_nome: data.fileName,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      };
      if (data.structure) {
        insertPayload.template_structure = data.structure;
        insertPayload.template_type = data.templateType || "hybrid";
      }

      const { error } = await supabase
        .from("contract_templates")
        .insert(insertPayload as never);

      if (error) {
        toast.error("Erro ao importar PDF: " + error.message);
      } else {
        toast.success(`Template "${data.nome}" importado com sucesso!`);
        setPdfPreview(null);
        fetchTemplates();
      }
    } catch (err) {
      toast.error("Erro ao salvar template");
      console.error(err);
    } finally {
      setSavingImport(false);
    }
  };

  const isEditing = editingTemplate !== null || htmlContent !== "";

  const handleVisualEditorSave = useCallback(async (html: string) => {
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Tenant não identificado"); return; }
    try {
      setSaving(true);
      const { error } = await supabase.from("contract_templates").insert({
        nome,
        conteudo_html: html,
        ativo: true,
        tenant_id: tenantId,
        template_type: "visual",
      } as never);
      if (error) { toast.error("Erro ao salvar: " + error.message); return; }
      toast.success("Contrato salvo com sucesso!");
      setVisualEditorMode(false);
      fetchTemplates();
    } catch (err) {
      toast.error("Erro ao salvar contrato");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [nome]);

  if (visualEditorMode) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Top header bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <div className="min-w-[200px] flex-1 max-w-md flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap font-medium">Nome do Modelo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contrato" className="h-8 text-sm" />
          </div>
        </div>
        {/* Editor fills remaining space */}
        <div className="flex-1 min-h-0">
          <ContractVisualEditor
            onSave={handleVisualEditorSave}
            onCancel={() => setVisualEditorMode(false)}
            variables={AVAILABLE_VARIABLES}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelos de Contrato</CardTitle>
            <div className="flex gap-2">
              <label className={importing ? "pointer-events-none opacity-60" : "cursor-pointer"}>
                <input
                  type="file"
                  accept=".json,.pdf,.docx,.xlsx,.xls"
                  className="hidden"
                  onChange={handleImportTemplate}
                  disabled={importing}
                />
                <Button variant="outline" size="sm" className="gap-2" asChild disabled={importing}>
                  <span>
                    <FolderInput className={`h-4 w-4 ${importing ? "animate-spin" : ""}`} />
                    {importing ? "Importando..." : "Importar (PDF, DOCX, JSON)"}
                  </span>
                </Button>
              </label>
              <Button size="sm" className="gap-2" onClick={handleNew}>
                <Plus className="h-4 w-4" />
                Novo Modelo
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => {
                setVisualEditorMode(true);
                setEditingTemplate(null);
                setNome("Novo Contrato");
                setHtmlContent("");
              }}>
                <PenTool className="h-4 w-4" />
                Criar do Zero
              </Button>
            </div>
          </div>
          {importing && importProgress && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary animate-pulse">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              {importProgress}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : templates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum modelo cadastrado</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-secondary/30"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.arquivo_original_nome || "Criado manualmente"}
                      </p>
                    </div>
                    {t.ativo && (
                      <Badge variant="secondary" className="text-xs">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleExportTemplate(t)} title="Exportar template">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(t)} title="Editar">
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(t.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[200px] flex-1">
                <Label className="mb-1 block text-xs">Nome do Modelo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contrato" />
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <Button variant="outline" size="sm" className="gap-2" asChild disabled={importing}>
                    <span>
                      <Upload className="h-4 w-4" />
                      {importing ? "Importando..." : "Importar Arquivo"}
                    </span>
                  </Button>
                </label>
                <Button
                  variant={viewMode === "editor" ? "default" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    if (viewMode === "editor" && editorRef.current) {
                      const captured = editorRef.current.innerHTML;
                      setHtmlContent(captured);
                      setViewMode("preview");
                      setEditorKey((k) => k + 1);
                    } else {
                      setViewMode("editor");
                      setEditorKey((k) => k + 1);
                    }
                  }}
                >
                  {viewMode === "editor" ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                  {viewMode === "editor" ? "Visualizar" : "Editar"}
                </Button>
                <Button
                  variant={dragMode ? "default" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={handleToggleDragMode}
                >
                  <Move className="h-4 w-4" />
                  {dragMode ? "Aplicar Posições" : "Mover Variáveis"}
                </Button>
                {dragMode && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <Grid3X3 className="h-3.5 w-3.5 text-muted-foreground" />
                    {[8, 16, 32].map((s) => (
                      <Button
                        key={s}
                        variant={gridSize === s ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setGridSize(s)}
                      >
                        {s}px
                      </Button>
                    ))}
                  </div>
                )}
                <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Variáveis disponíveis</span>
                <span className="text-xs text-muted-foreground">
                  {dragMode ? "(arraste para o contrato)" : "(clique para inserir)"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARIABLES.map((v) => (
                  <button
                    key={v.var}
                    onClick={() => !dragMode && insertVariable(v.var)}
                    draggable={dragMode}
                    onDragStart={(e) => {
                      if (!dragMode) return;
                      setIsDraggingPaletteVariable(true);
                      setIsPreviewDropActive(false);
                      e.dataTransfer.setData("text/plain", v.var);
                      e.dataTransfer.effectAllowed = "copy";
                      const ghost = document.createElement("div");
                      ghost.textContent = v.var;
                      ghost.style.cssText =
                        "position:fixed;top:-1000px;left:-1000px;padding:4px 10px;border-radius:6px;font-family:monospace;font-size:12px;color:hsl(210,80%,45%);background:hsl(210,80%,96%);border:2px dashed hsl(210,80%,55%,0.6);box-shadow:0 4px 16px hsl(210,80%,55%,0.25);white-space:nowrap;pointer-events:none;z-index:9999;";
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                      requestAnimationFrame(() => document.body.removeChild(ghost));
                    }}
                    onDragEnd={() => {
                      setIsDraggingPaletteVariable(false);
                      setIsPreviewDropActive(false);
                    }}
                    className={`rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary/20 ${dragMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    title={v.desc}
                  >
                    {v.var}
                  </button>
                ))}
              </div>
            </div>

            {/* Variable usage report */}
            {htmlContent && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    Relatório de variáveis — {variableReport.used.length}/{variableReport.total} em uso
                  </span>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {variableReport.used.length} usadas
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      {variableReport.missing.length} não usadas
                    </span>
                    {variableReport.unknown.length > 0 && (
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-destructive" />
                        {variableReport.unknown.length} desconhecidas
                      </span>
                    )}
                  </div>
                </div>

                {variableReport.unknown.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                    <p className="text-xs font-medium text-destructive mb-1">Variáveis não reconhecidas:</p>
                    <div className="flex flex-wrap gap-1">
                      {variableReport.unknown.map((v) => (
                        <span key={v} className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Ver detalhes ({variableReport.used.length} usadas, {variableReport.missing.length} disponíveis)
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {variableReport.used.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-emerald-600">✓ Em uso</p>
                        <div className="flex flex-wrap gap-1">
                          {variableReport.used.map((v) => (
                            <span key={v.var} className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs text-emerald-700" title={v.desc}>
                              {v.var}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {variableReport.missing.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-amber-600">○ Disponíveis (não usadas)</p>
                        <div className="flex flex-wrap gap-1">
                          {variableReport.missing.map((v) => (
                            <button
                              key={v.var}
                              onClick={() => insertVariable(v.var)}
                              className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs text-amber-700 hover:bg-amber-500/20 transition-colors cursor-pointer"
                              title={`${v.desc} — clique para inserir`}
                            >
                              {v.var}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}


            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/10 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs font-medium text-foreground">Marcação de campos sugeridos</p>
                  <p className="text-xs text-muted-foreground">
                    Destaca CPF, valores, datas e telefones encontrados no contrato
                  </p>
                </div>
              </div>
              <Switch checked={showHighlights} onCheckedChange={toggleHighlights} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/10 p-3">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-medium text-foreground">Conversão automática de campos</p>
                  <p className="text-xs text-muted-foreground">
                    Ao importar, substitui CPF, valores, datas e nomes por variáveis {"{{...}}"} automaticamente
                  </p>
                </div>
              </div>
            <Switch checked={autoReplace} onCheckedChange={setAutoReplace} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/10 p-3">
              <div className="flex items-center gap-2">
                <ImageOff className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-foreground">Imagem de fundo do PDF</p>
                  <p className="text-xs text-muted-foreground">
                    Mantém a imagem renderizada do PDF como fundo — desative para usar apenas texto posicionado
                  </p>
                </div>
              </div>
              <Switch
                checked={keepBackground}
                onCheckedChange={(checked) => {
                  setKeepBackground(checked);
                  // Strip or restore background images in the HTML
                  let currentHtml = htmlContent;
                  if (viewMode === "editor" && editorRef.current) {
                    currentHtml = editorRef.current.innerHTML;
                  }
                  if (!checked) {
                    // Remove background-image from sections and make text visible
                    currentHtml = currentHtml
                      .replace(/background-image:url\([^)]+\);background-size:100% 100%;background-repeat:no-repeat;/g, "")
                      .replace(/color:transparent;/g, "");
                  }
                  setHtmlContent(currentHtml);
                  setEditorKey((k) => k + 1);
                }}
              />
            </div>

            <Separator />

            {viewMode === "editor" ? (
              <div className="relative">
                <EditorToolbar editorRef={editorRef as React.RefObject<HTMLDivElement>} />
                <div
                  key={editorKey}
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="prose prose-sm min-h-[400px] max-w-none rounded-b-lg border border-border bg-background p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                  onInput={() => {
                    if (editorRef.current) setHtmlContent(editorRef.current.innerHTML);
                  }}
                  onKeyDown={(e) => {
                    // Paste as plain text to protect structure
                    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      navigator.clipboard.readText().then((text) => {
                        document.execCommand("insertText", false, text);
                        requestAnimationFrame(() => {
                          if (editorRef.current) setHtmlContent(editorRef.current.innerHTML);
                        });
                      });
                      return;
                    }

                    if (e.key === "Enter") {
                      requestAnimationFrame(() => {
                        if (editorRef.current) setHtmlContent(editorRef.current.innerHTML);
                      });
                    }
                  }}
                />
                <VariableAutocomplete variables={AVAILABLE_VARIABLES} editorRef={editorRef} />
                <VariableTooltip variables={AVAILABLE_VARIABLES} editorRef={editorRef} />
              </div>
            ) : (
              <div className="relative">
                <iframe
                  ref={iframeRef}
                  title="Preview fiel do contrato"
                  className="h-[75vh] w-full rounded-lg border border-border bg-muted/20"
                  srcDoc={previewDocument}
                />
                {dragMode && (
                  <div
                    className={`absolute inset-0 rounded-lg transition-all ${isPreviewDropActive ? "bg-primary/5 ring-2 ring-primary ring-inset" : "bg-transparent"}`}
                    style={{ pointerEvents: isDraggingPaletteVariable ? "auto" : "none", zIndex: 10 }}
                    onDragOver={(e) => {
                      if (!isDraggingPaletteVariable) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (!isPreviewDropActive) setIsPreviewDropActive(true);
                    }}
                    onDragEnter={(e) => {
                      if (!isDraggingPaletteVariable) return;
                      e.preventDefault();
                      setIsPreviewDropActive(true);
                    }}
                    onDragLeave={(e) => {
                      const nextTarget = e.relatedTarget as Node | null;
                      if (nextTarget && e.currentTarget.contains(nextTarget)) return;
                      setIsPreviewDropActive(false);
                    }}
                    onDrop={(e) => {
                      if (!isDraggingPaletteVariable) return;
                      e.preventDefault();
                      setIsDraggingPaletteVariable(false);
                      setIsPreviewDropActive(false);
                      const varText = e.dataTransfer.getData("text/plain");
                      if (!varText || !varText.startsWith("{{")) return;

                      // Calculate drop position relative to iframe
                      const iframeEl = iframeRef.current;
                      if (!iframeEl) return;
                      const iframeRect = iframeEl.getBoundingClientRect();
                      const dropX = e.clientX - iframeRect.left;
                      const dropY = e.clientY - iframeRect.top;

                      // Send drop info to iframe
                      iframeEl.contentWindow?.postMessage({
                        type: "drop-variable",
                        varText,
                        x: dropX,
                        y: dropY,
                      }, "*");
                    }}
                  />
                )}
              </div>
            )}

            {showHighlights && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Legenda:</span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-3 w-6 rounded-sm"
                    style={{
                      background: "linear-gradient(135deg, hsl(45 93% 80% / 0.6), hsl(45 93% 70% / 0.4))",
                      borderBottom: "2px solid hsl(45 93% 47%)",
                    }}
                  />
                  Campos detectados automaticamente — substitua pelas variáveis correspondentes
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Formatos aceitos: <strong>PDF</strong> (com OCR para escaneados), <strong>Word (.docx)</strong>,{" "}
              <strong>Excel (.xlsx/.xls)</strong>. O preview agora replica a paginação e a estrutura do documento salvo.
            </p>
          </CardContent>
        </Card>
      )}

      {pdfPreview && (
        <PdfImportPreviewModal
          open={!!pdfPreview}
          onClose={() => setPdfPreview(null)}
          onConfirm={handleConfirmPdfImport}
          imported={pdfPreview.imported}
          processedHtml={pdfPreview.processedHtml}
          replacements={pdfPreview.replacements}
          replacedCount={pdfPreview.replacedCount}
          fileName={pdfPreview.fileName}
          saving={savingImport}
        />
      )}
    </div>
  );
}

const DEFAULT_CONTRACT_HTML = `
<section class="contract-page" data-contract-page="true">
  <div class="contract-page__content">
    <h1 style="text-align: center;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
    <p style="text-align: center;"><strong>Contrato nº {{numero_contrato}}</strong></p>
    <p style="text-align: center;"><strong>{{empresa_nome}}</strong><br/>CNPJ: {{cnpj_loja}}<br/>{{endereco_loja}}, {{bairro_loja}} — {{cidade_loja}}/{{uf_loja}}</p>
    <hr/>
    <p>Pelo presente instrumento particular, de um lado:</p>
    <p><strong>CONTRATANTE:</strong> {{nome_cliente}}, nascido(a) em {{data_nascimento}}, profissão {{profissao}}, inscrito(a) no CPF/CNPJ sob nº {{cpf_cliente}}, RG/Insc. Estadual {{rg_insc_estadual}}, telefone {{telefone_cliente}}, e-mail {{email_cliente}}.</p>
    <p><strong>Tipo de Contrato:</strong> {{tipo_contrato}}</p>
    <p><strong>Endereço:</strong> {{endereco}}, {{bairro}} — {{cidade}}/{{uf}}, CEP {{cep}}.</p>
    <p><strong>CONTRATADA:</strong> {{empresa_nome}}, CNPJ {{cnpj_loja}}, com sede em {{endereco_loja}}, {{bairro_loja}} — {{cidade_loja}}/{{uf_loja}}, CEP {{cep_loja}}.</p>

    <h2>CLÁUSULA 1ª — DO OBJETO</h2>
    <p>O presente contrato tem por objeto a prestação de serviços conforme orçamento nº <strong>{{numero_orcamento}}</strong>, elaborado pelo(a) projetista <strong>{{projetista}}</strong>, responsável pela venda: <strong>{{responsavel_venda}}</strong>.</p>

    <h2>CLÁUSULA 2ª — DOS ITENS CONTRATADOS</h2>
     {{itens_tabela}}
    <p><strong>Total dos ambientes: {{total_ambientes}}</strong></p>

    <h3>Produtos do Catálogo</h3>
    {{produtos_catalogo}}

    <h3>Detalhamento dos materiais</h3>
    {{itens_detalhes}}

    <h2>CLÁUSULA 3ª — DO VALOR E PAGAMENTO</h2>
    <p>O valor total dos serviços é de <strong>{{valor_final}}</strong>, conforme detalhamento abaixo:</p>
    <ul>
      <li>Valor de tela: {{valor_tela}}</li>
      <li>Forma de pagamento: {{forma_pagamento}}</li>
      <li>Entrada: {{valor_entrada}}</li>
      <li>Parcelas: {{parcelas}}x de {{valor_parcela}}</li>
    </ul>

    <h2>CLÁUSULA 4ª — DA ENTREGA</h2>
    <p><strong>Endereço de entrega:</strong> {{endereco_entrega}}, {{bairro_entrega}} — {{cidade_entrega}}/{{uf_entrega}}, CEP {{cep_entrega}}.</p>
    <p><strong>Prazo de entrega:</strong> {{prazo_entrega}}</p>

    <h2>CLÁUSULA 5ª — DO INDICADOR</h2>
    <p>Indicador: {{indicador_nome}} — Comissão: {{indicador_comissao}}%</p>

    <h2>CLÁUSULA 6ª — OBSERVAÇÕES</h2>
    <p>{{observacoes}}</p>

    <h2>CLÁUSULA 7ª — DAS DISPOSIÇÕES GERAIS</h2>
    <p>As partes elegem o foro da comarca de {{cidade_loja}}/{{uf_loja}} para dirimir quaisquer dúvidas oriundas do presente contrato.</p>
    <br/>
    <p>{{cidade_loja}}, {{data_atual}}</p>
    <br/><br/>
    <p>_________________________________<br/>{{nome_cliente}}<br/>CPF/CNPJ: {{cpf_cliente}}<br/>CONTRATANTE</p>
    <br/>
    <p>_________________________________<br/>{{empresa_nome}}<br/>CNPJ: {{cnpj_loja}}<br/>CONTRATADA</p>
  </div>
</section>
`;
