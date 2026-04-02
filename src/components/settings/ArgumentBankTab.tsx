/**
 * Banco de Argumentos — Settings tab for managing custom sales arguments.
 * Available for: Vendedor, Projetista, Administrador, Gerente.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Lightbulb, Search, Globe, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { miaInvoke } from "@/services/mia/MIAInvoke";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";

interface Argumento {
  id: string;
  tenant_id: string;
  categoria: string;
  titulo: string;
  argumento: string;
  dados_reais?: string;
  fonte?: string;
  criado_por?: string;
  created_at: string;
}

const CATEGORIAS = [
  { value: "diferencial", label: "Diferencial Competitivo" },
  { value: "material", label: "Materiais e Qualidade" },
  { value: "preco", label: "Contorno de Preço" },
  { value: "garantia", label: "Garantia e Pós-Venda" },
  { value: "design", label: "Design e Tendências" },
  { value: "processo", label: "Processo Produtivo" },
  { value: "case", label: "Cases de Sucesso" },
  { value: "mercado", label: "Dados de Mercado" },
  { value: "urgencia", label: "Urgência e Escassez" },
  { value: "outro", label: "Outro" },
];

const EMPTY_FORM = {
  categoria: "diferencial",
  titulo: "",
  argumento: "",
  dados_reais: "",
  fonte: "",
};

export function ArgumentBankTab() {
  const [argumentos, setArgumentos] = useState<Argumento[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{ content: string; citations: string[] } | null>(null);
  const [improvingTitle, setImprovingTitle] = useState(false);
  const [improvingArg, setImprovingArg] = useState(false);
  const [searchingData, setSearchingData] = useState(false);

  const tenantId = getTenantId();

  const loadArgumentos = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("argument_bank" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (data) setArgumentos(data as unknown as Argumento[]);
  }, [tenantId]);

  useEffect(() => { loadArgumentos(); }, [loadArgumentos]);

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.argumento.trim()) {
      toast.error("Título e argumento são obrigatórios");
      return;
    }
    if (!tenantId) return;

    if (editingId) {
      const { error } = await (supabase.from("argument_bank" as any)
        .update({
          categoria: form.categoria,
          titulo: form.titulo.trim(),
          argumento: form.argumento.trim(),
          dados_reais: form.dados_reais.trim() || null,
          fonte: form.fonte.trim() || null,
        } as any)
        .eq("id", editingId));
      if (error) { toast.error("Erro ao atualizar"); return; }
      // Update locally for instant feedback
      setArgumentos(prev => prev.map(a =>
        a.id === editingId
          ? { ...a, categoria: form.categoria, titulo: form.titulo.trim(), argumento: form.argumento.trim(), dados_reais: form.dados_reais.trim() || undefined, fonte: form.fonte.trim() || undefined }
          : a
      ));
      toast.success("Argumento atualizado!");
    } else {
      const newEntry = {
        tenant_id: tenantId,
        categoria: form.categoria,
        titulo: form.titulo.trim(),
        argumento: form.argumento.trim(),
        dados_reais: form.dados_reais.trim() || null,
        fonte: form.fonte.trim() || null,
      };
      const { data, error } = await (supabase.from("argument_bank" as any)
        .insert(newEntry as any)
        .select("*")
        .single());
      if (error) { toast.error("Erro ao adicionar"); return; }
      // Add to list immediately
      if (data) {
        setArgumentos(prev => [data as unknown as Argumento, ...prev]);
      }
      toast.success("Argumento adicionado!");
    }

    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(false);
  };

  const handleEdit = (arg: Argumento) => {
    setEditingId(arg.id);
    setForm({
      categoria: arg.categoria,
      titulo: arg.titulo,
      argumento: arg.argumento,
      dados_reais: arg.dados_reais || "",
      fonte: arg.fonte || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este argumento?")) return;
    const { error } = await (supabase.from("argument_bank" as any).delete().eq("id", id));
    if (error) toast.error("Erro ao excluir");
    else {
      setArgumentos(prev => prev.filter(a => a.id !== id));
      toast.success("Excluído!");
    }
  };

  // Perplexity real-time search (top card)
  const handlePerplexitySearch = async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("perplexity-search", {
        body: { query, context: "Busca para banco de argumentos de vendas de móveis planejados" },
      });
      if (error) throw error;
      setSearchResult({ content: data.content, citations: data.citations || [] });
    } catch {
      toast.error("Erro ao pesquisar. Verifique a conexão com Perplexity.");
    }
    setSearching(false);
  };

  // AI improve title — uses vendazap-ai (already deployed) with messages passthrough to OpenAI
  const handleImproveTitle = async () => {
    if (!form.titulo.trim()) { toast.error("Digite um título primeiro"); return; }
    setImprovingTitle(true);
    try {
      const { data, error } = await miaInvoke("vendazap-ai", {
          messages: [
            { role: "system", content: "Você é um especialista em copywriting para vendas de móveis planejados. Melhore o título do argumento de venda para ser mais persuasivo, profissional e impactante. Retorne APENAS o título melhorado, sem explicações, aspas ou prefixos." },
            { role: "user", content: form.titulo },
          ],
          max_tokens: 100,
        }, {
          tenantId: getTenantId() || "",
          userId: "system",
          origin: "chat",
          context: "argument",
        });
      if (error) throw error;
      const improved = (data?.reply || "").trim();
      if (improved) { setForm(f => ({ ...f, titulo: improved })); toast.success("Título melhorado!"); }
      else toast.error("Não foi possível melhorar o título");
    } catch {
      toast.error("Erro ao melhorar título com IA");
    }
    setImprovingTitle(false);
  };

  // AI improve argument
  const handleImproveArgument = async () => {
    if (!form.argumento.trim()) { toast.error("Digite um argumento primeiro"); return; }
    setImprovingArg(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          messages: [
            { role: "system", content: "Você é um especialista em vendas de móveis planejados. Melhore o argumento de venda para ser mais convincente, com linguagem persuasiva e técnica. Retorne APENAS o argumento melhorado, sem explicações, aspas ou prefixos. Máximo 500 caracteres." },
            { role: "user", content: form.argumento },
          ],
          max_tokens: 300,
        },
      });
      if (error) throw error;
      const improved = (data?.reply || "").trim();
      if (improved) { setForm(f => ({ ...f, argumento: improved })); toast.success("Argumento melhorado!"); }
      else toast.error("Não foi possível melhorar o argumento");
    } catch {
      toast.error("Erro ao melhorar argumento com IA");
    }
    setImprovingArg(false);
  };

  // Search real data about the topic via OpenAI
  const handleSearchRealData = async () => {
    const topic = form.titulo.trim() || form.argumento.trim();
    if (!topic) { toast.error("Preencha o título ou argumento para buscar dados reais"); return; }
    setSearchingData(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          messages: [
            { role: "system", content: "Você é um pesquisador especialista no mercado de móveis planejados no Brasil. Forneça dados reais, estatísticas, pesquisas e tendências sobre o tema solicitado. Inclua números, percentuais e fontes quando possível. Responda em português brasileiro. Máximo 500 caracteres." },
            { role: "user", content: `Dados reais, estatísticas e pesquisas sobre: ${topic} - mercado de móveis planejados Brasil` },
          ],
          max_tokens: 400,
        },
      });
      if (error) throw error;
      const content = (data?.reply || "").trim();
      if (content) {
        setForm(f => ({ ...f, dados_reais: content.slice(0, 500) }));
        toast.success("Dados reais encontrados e preenchidos!");
      } else toast.error("Não foi possível buscar dados reais");
    } catch {
      toast.error("Erro ao buscar dados reais via IA");
    }
    setSearchingData(false);
  };

  const filtered = argumentos.filter(a => {
    const matchSearch = !searchTerm || a.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || a.argumento.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = filterCategoria === "all" || a.categoria === filterCategoria;
    return matchSearch && matchCategoria;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Banco de Argumentos
            </CardTitle>
            <Button onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Argumento
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Cadastre seus diferenciais reais para a IA usar nas argumentações de venda.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Perplexity Search */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Pesquisa em Tempo Real (Perplexity)</span>
              </div>
              <p className="text-xs text-muted-foreground">Busque dados reais da internet para enriquecer seus argumentos</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: tendências de design de cozinhas 2024 Brasil"
                  onKeyDown={e => { if (e.key === "Enter") handlePerplexitySearch((e.target as HTMLInputElement).value); }}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 shrink-0"
                  disabled={searching}
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('input[placeholder*="tendências"]');
                    if (input?.value) handlePerplexitySearch(input.value);
                  }}
                >
                  <Search className="h-3 w-3" />
                  {searching ? "Buscando..." : "Buscar"}
                </Button>
              </div>
              {searchResult && (
                <div className="bg-background border rounded-lg p-3 space-y-2">
                  <p className="text-xs text-foreground whitespace-pre-wrap">{searchResult.content}</p>
                  {searchResult.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {searchResult.citations.slice(0, 5).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline truncate max-w-[200px]">
                          [{i + 1}] {new URL(url).hostname}
                        </a>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => {
                      setForm(prev => ({
                        ...prev,
                        dados_reais: searchResult.content.slice(0, 500),
                        fonte: searchResult.citations[0] || "",
                        categoria: "mercado",
                      }));
                      setEditingId(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="h-2.5 w-2.5" /> Usar como Argumento
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex gap-2">
            <Input
              placeholder="Buscar argumento..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Categoria</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="max-w-[300px]">Argumento</TableHead>
                  <TableHead>Dados Reais</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum argumento cadastrado. Adicione seus diferenciais para a IA usar!
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(arg => (
                  <TableRow key={arg.id}>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {CATEGORIAS.find(c => c.value === arg.categoria)?.label || arg.categoria}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{arg.titulo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{arg.argumento}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{arg.dados_reais ? "✅" : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(arg)}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(arg.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} argumento(s) cadastrado(s)</p>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Argumento" : "Novo Argumento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Título *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 text-primary"
                  disabled={improvingTitle || !form.titulo.trim()}
                  onClick={handleImproveTitle}
                >
                  {improvingTitle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Melhorar com IA
                </Button>
              </div>
              <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} className="mt-1" placeholder="Ex: Ferragens Blum com garantia vitalícia" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Argumento *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 text-primary"
                  disabled={improvingArg || !form.argumento.trim()}
                  onClick={handleImproveArgument}
                >
                  {improvingArg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Melhorar com IA
                </Button>
              </div>
              <Textarea value={form.argumento} onChange={e => setForm(f => ({ ...f, argumento: e.target.value }))} className="mt-1" rows={3} placeholder="Descreva o argumento que a IA deve usar..." />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Dados Reais (opcional)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 text-primary"
                  disabled={searchingData || (!form.titulo.trim() && !form.argumento.trim())}
                  onClick={handleSearchRealData}
                >
                  {searchingData ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                  Buscar na Internet
                </Button>
              </div>
              <Textarea value={form.dados_reais} onChange={e => setForm(f => ({ ...f, dados_reais: e.target.value }))} className="mt-1" rows={2} placeholder="Números, estatísticas, pesquisas que suportam o argumento..." />
            </div>
            <div>
              <Label>Fonte (opcional)</Label>
              <Input value={form.fonte} onChange={e => setForm(f => ({ ...f, fonte: e.target.value }))} className="mt-1" placeholder="URL ou referência da fonte" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
