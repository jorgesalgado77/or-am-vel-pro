import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Save, Trash2, Plus, FileText, Eye, Code, Info } from "lucide-react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

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
  { var: "{{telefone_cliente}}", desc: "Telefone do cliente" },
  { var: "{{email_cliente}}", desc: "Email do cliente" },
  { var: "{{numero_orcamento}}", desc: "Nº do orçamento" },
  { var: "{{projetista}}", desc: "Projetista responsável" },
  { var: "{{valor_tela}}", desc: "Valor de tela" },
  { var: "{{valor_final}}", desc: "Valor final" },
  { var: "{{forma_pagamento}}", desc: "Forma de pagamento" },
  { var: "{{parcelas}}", desc: "Número de parcelas" },
  { var: "{{valor_parcela}}", desc: "Valor da parcela" },
  { var: "{{valor_entrada}}", desc: "Valor da entrada" },
  { var: "{{data_atual}}", desc: "Data atual" },
  { var: "{{empresa_nome}}", desc: "Nome da empresa" },
  { var: "{{indicador_nome}}", desc: "Nome do indicador" },
  { var: "{{indicador_comissao}}", desc: "Comissão do indicador (%)" },
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
  const editorRef = useRef<HTMLDivElement>(null);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("contract_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setTemplates((data as ContractTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleNew = () => {
    setEditingTemplate(null);
    setNome("Novo Contrato");
    setHtmlContent(DEFAULT_CONTRACT_HTML);
    setViewMode("editor");
    setEditorKey(k => k + 1);
  };

  const handleEdit = (t: ContractTemplate) => {
    setEditingTemplate(t);
    setNome(t.nome);
    setHtmlContent(t.conteudo_html);
    setViewMode("editor");
    setEditorKey(k => k + 1);
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do contrato"); return; }
    setSaving(true);

    // Get content from contentEditable if in editor mode
    let finalHtml = htmlContent;
    if (viewMode === "editor" && editorRef.current) {
      finalHtml = editorRef.current.innerHTML;
      setHtmlContent(finalHtml);
    }

    if (editingTemplate) {
      const { error } = await supabase
        .from("contract_templates")
        .update({ nome, conteudo_html: finalHtml } as any)
        .eq("id", editingTemplate.id);
      if (error) toast.error("Erro ao salvar");
      else toast.success("Contrato atualizado!");
    } else {
      const { error } = await supabase
        .from("contract_templates")
        .insert({ nome, conteudo_html: finalHtml } as any);
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
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "docx") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setHtmlContent(result.value);
        setEditorKey(k => k + 1);
        if (!nome || nome === "Novo Contrato") setNome(file.name.replace(/\.docx$/i, ""));
        toast.success("Documento Word importado!");
      } else if (ext === "xlsx" || ext === "xls") {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const html = XLSX.utils.sheet_to_html(sheet);
        setHtmlContent(html);
        if (!nome || nome === "Novo Contrato") setNome(file.name.replace(/\.(xlsx?|csv)$/i, ""));
        toast.success("Planilha Excel importada!");
      } else if (ext === "pdf") {
        // Upload PDF to storage and store URL
        const path = `contracts/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
        if (upErr) { toast.error("Erro ao enviar PDF"); setImporting(false); return; }
        const { data: { publicUrl } } = supabase.storage.from("company-assets").getPublicUrl(path);

        setHtmlContent(`<p><em>PDF importado: ${file.name}</em></p><p>O conteúdo do PDF foi armazenado. Você pode editar o texto do contrato abaixo ou substituir pelo conteúdo desejado.</p><hr/><p>Arquivo original: <a href="${publicUrl}" target="_blank">${file.name}</a></p>`);
        if (!nome || nome === "Novo Contrato") setNome(file.name.replace(/\.pdf$/i, ""));
        toast.success("PDF importado! Edite o conteúdo do contrato manualmente.");
      } else {
        toast.error("Formato não suportado. Use PDF, Word (.docx) ou Excel (.xlsx).");
      }
    } catch (err) {
      toast.error("Erro ao importar arquivo");
      console.error(err);
    }

    setImporting(false);
    e.target.value = "";
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
      setHtmlContent(prev => prev + varName);
    }
  };

  const isEditing = editingTemplate !== null || htmlContent !== "";

  return (
    <div className="space-y-6">
      {/* Template list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelos de Contrato</CardTitle>
            <Button size="sm" className="gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" />Novo Modelo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum modelo cadastrado</p>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm text-foreground">{t.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.arquivo_original_nome || "Criado manualmente"}
                      </p>
                    </div>
                    {t.ativo && <Badge variant="secondary" className="text-xs">Ativo</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(t)} title="Editar">
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      {isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs mb-1 block">Nome do Modelo</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do contrato" />
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept=".pdf,.docx,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
                  <Button variant="outline" size="sm" className="gap-2" asChild disabled={importing}>
                    <span><Upload className="h-4 w-4" />{importing ? "Importando..." : "Importar Arquivo"}</span>
                  </Button>
                </label>
                <Button
                  variant={viewMode === "editor" ? "default" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    if (viewMode === "editor" && editorRef.current) {
                      setHtmlContent(editorRef.current.innerHTML);
                    }
                    setViewMode(viewMode === "editor" ? "preview" : "editor");
                  }}
                >
                  {viewMode === "editor" ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                  {viewMode === "editor" ? "Visualizar" : "Editar"}
                </Button>
                <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Variables panel */}
            <div className="p-3 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Variáveis disponíveis</span>
                <span className="text-xs text-muted-foreground">(clique para inserir)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARIABLES.map(v => (
                  <button
                    key={v.var}
                    onClick={() => insertVariable(v.var)}
                    className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md hover:bg-primary/20 transition-colors font-mono"
                    title={v.desc}
                  >
                    {v.var}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Editor / Preview */}
            {viewMode === "editor" ? (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[400px] p-4 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            ) : (
              <div className="min-h-[400px] p-6 border border-border rounded-lg bg-white text-black">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Formatos aceitos para importação: <strong>PDF</strong>, <strong>Word (.docx)</strong>, <strong>Excel (.xlsx)</strong>.
              O conteúdo importado pode ser editado livremente acima.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const DEFAULT_CONTRACT_HTML = `
<h1 style="text-align: center;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<p style="text-align: center;"><strong>{{empresa_nome}}</strong></p>
<hr/>
<p>Pelo presente instrumento particular, de um lado:</p>
<p><strong>CONTRATANTE:</strong> {{nome_cliente}}, inscrito(a) no CPF/CNPJ sob nº {{cpf_cliente}}, telefone {{telefone_cliente}}, e-mail {{email_cliente}}.</p>
<p><strong>CONTRATADA:</strong> {{empresa_nome}}.</p>
<h2>CLÁUSULA 1ª - DO OBJETO</h2>
<p>O presente contrato tem por objeto a prestação de serviços conforme orçamento nº <strong>{{numero_orcamento}}</strong>, elaborado pelo(a) projetista <strong>{{projetista}}</strong>.</p>
<h2>CLÁUSULA 2ª - DO VALOR</h2>
<p>O valor total dos serviços é de <strong>{{valor_final}}</strong>, conforme detalhamento abaixo:</p>
<ul>
  <li>Valor de tela: {{valor_tela}}</li>
  <li>Forma de pagamento: {{forma_pagamento}}</li>
  <li>Entrada: {{valor_entrada}}</li>
  <li>Parcelas: {{parcelas}}x de {{valor_parcela}}</li>
</ul>
<h2>CLÁUSULA 3ª - DO PRAZO</h2>
<p>O prazo para execução dos serviços será acordado entre as partes após a assinatura deste contrato.</p>
<h2>CLÁUSULA 4ª - DAS DISPOSIÇÕES GERAIS</h2>
<p>As partes elegem o foro da comarca de ______________ para dirimir quaisquer dúvidas oriundas do presente contrato.</p>
<br/>
<p>______________, {{data_atual}}</p>
<br/><br/>
<p>_________________________________<br/>{{nome_cliente}}<br/>CONTRATANTE</p>
<br/>
<p>_________________________________<br/>{{empresa_nome}}<br/>CONTRATADA</p>
`;
