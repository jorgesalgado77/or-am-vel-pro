import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Save, Trash2, Plus, FileText, Eye, Code, Info, Sparkles } from "lucide-react";
import { importContractFile, highlightSuggestedFields, removeHighlights } from "@/lib/contractImport";
import { buildContractDocumentHtml } from "@/lib/contractDocument";

interface ContractTemplate {
  id: string;
  nome: string;
  conteudo_html: string;
  arquivo_original_url: string | null;
  arquivo_original_nome: string | null;
  ativo: boolean;
  created_at: string;
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
  { var: "{{prazo_entrega}}", desc: "Prazo de entrega" },
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
  const [editorKey, setEditorKey] = useState(0);
  const [showHighlights, setShowHighlights] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  const previewDocument = useMemo(
    () => buildContractDocumentHtml(removeHighlights(htmlContent), nome || "Preview do contrato"),
    [htmlContent, nome],
  );

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("contract_templates")
      .select("*")
      .order("created_at", { ascending: false });
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
      const { error } = await supabase
        .from("contract_templates")
        .update({ nome, conteudo_html: finalHtml } as never)
        .eq("id", editingTemplate.id);
      if (error) toast.error("Erro ao salvar");
      else toast.success("Contrato atualizado!");
    } else {
      const { error } = await supabase
        .from("contract_templates")
        .insert({ nome, conteudo_html: finalHtml } as never);
      if (error) toast.error("Erro ao criar");
      else toast.success("Contrato criado!");
    }
    setSaving(false);
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este modelo de contrato?")) return;
    await supabase.from("contract_templates").delete().eq("id", id);
    toast.success("Excluído!");
    if (editingTemplate?.id === id) {
      setEditingTemplate(null);
      setHtmlContent("");
      setNome("");
    }
    fetchTemplates();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const imported = await importContractFile(file);
      const highlighted = showHighlights ? highlightSuggestedFields(imported.html) : imported.html;

      setHtmlContent(highlighted);
      setViewMode("editor");
      setEditorKey((k) => k + 1);

      if (!nome || nome === "Novo Contrato") {
        setNome(imported.suggestedName);
      }

      toast.success(`${imported.sourceLabel} importado e carregado para edição!`);
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

  const isEditing = editingTemplate !== null || htmlContent !== "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelos de Contrato</CardTitle>
            <Button size="sm" className="gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" />
              Novo Modelo
            </Button>
          </div>
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
                <span className="text-xs text-muted-foreground">(clique para inserir)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARIABLES.map((v) => (
                  <button
                    key={v.var}
                    onClick={() => insertVariable(v.var)}
                    className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary/20"
                    title={v.desc}
                  >
                    {v.var}
                  </button>
                ))}
              </div>
            </div>

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

            <Separator />

            {viewMode === "editor" ? (
              <div
                key={editorKey}
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="prose prose-sm min-h-[400px] max-w-none rounded-lg border border-border bg-background p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            ) : (
              <iframe
                title="Preview fiel do contrato"
                className="h-[75vh] w-full rounded-lg border border-border bg-muted/20"
                srcDoc={previewDocument}
              />
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
    <p><strong>Endereço:</strong> {{endereco}}, {{bairro}} — {{cidade}}/{{uf}}, CEP {{cep}}.</p>
    <p><strong>CONTRATADA:</strong> {{empresa_nome}}, CNPJ {{cnpj_loja}}, com sede em {{endereco_loja}}, {{bairro_loja}} — {{cidade_loja}}/{{uf_loja}}, CEP {{cep_loja}}.</p>

    <h2>CLÁUSULA 1ª — DO OBJETO</h2>
    <p>O presente contrato tem por objeto a prestação de serviços conforme orçamento nº <strong>{{numero_orcamento}}</strong>, elaborado pelo(a) projetista <strong>{{projetista}}</strong>, responsável pela venda: <strong>{{responsavel_venda}}</strong>.</p>

    <h2>CLÁUSULA 2ª — DOS ITENS CONTRATADOS</h2>
    {{itens_tabela}}
    <p><strong>Total dos ambientes: {{total_ambientes}}</strong></p>

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
