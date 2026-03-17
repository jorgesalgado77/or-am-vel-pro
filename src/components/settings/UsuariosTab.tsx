import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useCargos } from "@/hooks/useCargos";

const EMPTY_FORM = { nome_completo: "", apelido: "", telefone: "", email: "", cargo_id: "" };

export function UsuariosTab() {
  const { usuarios, refresh } = useUsuarios();
  const { cargos } = useCargos();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleAdd = async () => {
    if (!form.nome_completo.trim()) { toast.error("Nome completo é obrigatório"); return; }
    const { error } = await supabase.from("usuarios").insert({
      nome_completo: form.nome_completo.trim(),
      apelido: form.apelido.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cargo_id: form.cargo_id || null,
    });
    if (error) toast.error("Erro ao adicionar usuário");
    else { toast.success("Usuário adicionado!"); setForm(EMPTY_FORM); refresh(); }
  };

  const handleEdit = (u: typeof usuarios[0]) => {
    setEditingId(u.id);
    setForm({
      nome_completo: u.nome_completo,
      apelido: u.apelido || "",
      telefone: u.telefone || "",
      email: u.email || "",
      cargo_id: u.cargo_id || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingId || !form.nome_completo.trim()) { toast.error("Nome completo é obrigatório"); return; }
    const { error } = await supabase.from("usuarios").update({
      nome_completo: form.nome_completo.trim(),
      apelido: form.apelido.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cargo_id: form.cargo_id || null,
    }).eq("id", editingId);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success("Usuário atualizado!"); setEditDialogOpen(false); setEditingId(null); setForm(EMPTY_FORM); refresh(); }
  };

  const handleToggleAtivo = async (id: string, currentAtivo: boolean) => {
    const { error } = await supabase.from("usuarios").update({ ativo: !currentAtivo } as any).eq("id", id);
    if (error) toast.error("Erro ao alterar status");
    else refresh();
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir usuário "${nome}"?`)) return;
    const { error } = await supabase.from("usuarios").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const getCargoNome = (cargoId: string | null) => {
    if (!cargoId) return "—";
    return cargos.find(c => c.id === cargoId)?.nome || "—";
  };

  const renderForm = (isDialog = false) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label>Nome Completo *</Label>
        <Input value={form.nome_completo} onChange={e => setForm(f => ({ ...f, nome_completo: e.target.value }))} className="mt-1" />
      </div>
      <div>
        <Label>Apelido</Label>
        <Input value={form.apelido} onChange={e => setForm(f => ({ ...f, apelido: e.target.value }))} className="mt-1" />
      </div>
      <div>
        <Label>Telefone</Label>
        <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="mt-1" />
      </div>
      <div>
        <Label>Email</Label>
        <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
      </div>
      <div>
        <Label>Cargo</Label>
        <Select value={form.cargo_id} onValueChange={v => setForm(f => ({ ...f, cargo_id: v }))}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um cargo" /></SelectTrigger>
          <SelectContent>
            {cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar Usuário</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {renderForm()}
          <div className="flex justify-end">
            <Button onClick={handleAdd} className="gap-2"><Plus className="h-4 w-4" />Adicionar Usuário</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Usuários Cadastrados</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Apelido</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum usuário cadastrado</TableCell></TableRow>
                )}
                {usuarios.map(u => (
                  <TableRow key={u.id} className={!u.ativo ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{u.nome_completo}</TableCell>
                    <TableCell>{u.apelido || "—"}</TableCell>
                    <TableCell>{u.telefone || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{getCargoNome(u.cargo_id)}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={u.ativo} onCheckedChange={() => handleToggleAtivo(u.id, u.ativo)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(u)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(u.id, u.nome_completo)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          {renderForm(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
