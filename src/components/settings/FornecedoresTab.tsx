/**
 * Fornecedores (Suppliers) Settings Tab — CRUD for supplier registration
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Factory, Pencil, Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { maskCpfCnpj, maskPhone, maskCep } from "@/lib/masks";
import { toast } from "sonner";

export interface Fornecedor {
  id: string;
  nome: string;
  razao_social: string;
  cnpj: string;
  telefone: string;
  whatsapp: string;
  email: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  contato: string;
  observacoes: string;
  ativo: boolean;
}

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const emptyFornecedor: Omit<Fornecedor, "id"> = {
  nome: "", razao_social: "", cnpj: "", telefone: "", whatsapp: "", email: "",
  endereco: "", bairro: "", cidade: "", uf: "", cep: "", contato: "", observacoes: "", ativo: true,
};

export function FornecedoresTab() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<Omit<Fornecedor, "id">>(emptyFornecedor);
  const [search, setSearch] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => { loadFornecedores(); }, []);

  const loadFornecedores = async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    const { data } = await supabase
      .from("tenant_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("chave", "fornecedores")
      .maybeSingle();

    if (data && (data as any).valor) {
      try { setFornecedores(JSON.parse((data as any).valor)); } catch { setFornecedores([]); }
    }
    setLoading(false);
  };

  const saveFornecedores = async (updated: Fornecedor[]) => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    setSaving(true);

    // Try upsert first, fallback to delete+insert if constraint missing
    const payload = {
      tenant_id: tenantId,
      chave: "fornecedores",
      valor: JSON.stringify(updated),
    };

    const { error } = await supabase
      .from("tenant_settings" as any)
      .upsert(payload as any, { onConflict: "tenant_id,chave" });

    if (error) {
      console.error("Upsert error, trying delete+insert:", error);
      // Fallback: delete then insert
      await supabase
        .from("tenant_settings" as any)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("chave", "fornecedores");

      const { error: insertError } = await supabase
        .from("tenant_settings" as any)
        .insert(payload as any);

      if (insertError) {
        console.error("Insert error:", insertError);
        toast.error("Erro ao salvar fornecedores. Verifique se a tabela tenant_settings existe.");
        setSaving(false);
        return;
      }
    }

    toast.success("Fornecedores salvos!");
    setSaving(false);
  };

  const fetchCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setForm(prev => ({
        ...prev,
        endereco: data.logradouro || prev.endereco,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        uf: data.uf || prev.uf,
      }));
      toast.success("Endereço preenchido pelo CEP!");
    } catch { toast.error("Erro ao buscar CEP"); }
    finally { setCepLoading(false); }
  };

  const handleCepChange = (value: string) => {
    const masked = maskCep(value);
    setForm(prev => ({ ...prev, cep: masked }));
    if (masked.replace(/\D/g, "").length === 8) {
      fetchCep(masked);
    }
  };

  const openNew = () => { setEditing(null); setForm({ ...emptyFornecedor }); setDialogOpen(true); };
  const openEdit = (f: Fornecedor) => { setEditing(f); setForm({ ...f }); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.nome.trim()) { toast.error("Informe o nome do fornecedor"); return; }
    let updated: Fornecedor[];
    if (editing) {
      updated = fornecedores.map(f => f.id === editing.id ? { ...form, id: editing.id } : f);
    } else {
      updated = [...fornecedores, { ...form, id: crypto.randomUUID() }];
    }
    setFornecedores(updated);
    saveFornecedores(updated);
    setDialogOpen(false);
  };

  const handleRemove = (id: string) => {
    const updated = fornecedores.filter(f => f.id !== id);
    setFornecedores(updated);
    saveFornecedores(updated);
  };

  const filtered = fornecedores.filter(f =>
    !search || f.nome.toLowerCase().includes(search.toLowerCase()) || f.razao_social.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              Fornecedores Cadastrados
            </CardTitle>
            <Button size="sm" className="gap-1.5 h-8 text-xs w-full sm:w-auto" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Novo Fornecedor
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cadastre os fornecedores que aparecerão nos itens do contrato de venda.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar fornecedor..." className="pl-8 h-9 text-sm" />
          </div>

          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {search ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado. Clique em \"Novo Fornecedor\"."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome Fantasia</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">CNPJ</TableHead>
                    <TableHead className="text-xs">Telefone</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Cidade/UF</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Contato</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs font-medium">{f.nome}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">{f.cnpj || "—"}</TableCell>
                      <TableCell className="text-xs">{f.telefone || "—"}</TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{f.cidade ? `${f.cidade}/${f.uf}` : "—"}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{f.contato || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(f.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de cadastro/edição — responsivo com scroll */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              {editing ? "Editar Fornecedor" : "Novo Fornecedor"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6" style={{ maxHeight: "calc(90dvh - 130px)" }}>
            <div className="space-y-3 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome Fantasia *</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="mt-1 h-9 text-sm" placeholder="Nome fantasia" />
                </div>
                <div>
                  <Label className="text-xs">Razão Social</Label>
                  <Input value={form.razao_social} onChange={e => setForm({ ...form, razao_social: e.target.value })} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">CNPJ</Label>
                  <Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: maskCpfCnpj(e.target.value) })} className="mt-1 h-9 text-sm" placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <Label className="text-xs">Telefone</Label>
                  <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: maskPhone(e.target.value) })} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">WhatsApp (Contato/Representante)</Label>
                  <Input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Pessoa de Contato / Representante</Label>
                  <Input value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">CEP</Label>
                  <div className="relative">
                    <Input value={form.cep} onChange={e => handleCepChange(e.target.value)} className="mt-1 h-9 text-sm pr-8" placeholder="00000-000" />
                    {cepLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Endereço</Label>
                <Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} className="mt-1 h-9 text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Bairro</Label>
                  <Input value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">UF</Label>
                  <Select value={form.uf} onValueChange={v => setForm({ ...form, uf: v })}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} className="mt-1 text-sm min-h-[60px]" />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="px-4 sm:px-6 py-3 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
