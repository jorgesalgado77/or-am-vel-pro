import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComissoesIndicadores } from "@/components/settings/ComissoesIndicadores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Pencil, X, Upload } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useIndicadores } from "@/hooks/useIndicadores";
import { maskPhone } from "@/lib/masks";
import { useTenant } from "@/contexts/TenantContext";

export function IndicadoresTab() {
  const { indicadores, refresh } = useIndicadores();
  const { tenantId } = useTenant();
  const [newName, setNewName] = useState("");
  const [newComissao, setNewComissao] = useState(0);
  const [newTelefone, setNewTelefone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editing, setEditing] = useState<Record<string, { nome: string; comissao_percentual: number; telefone: string; email: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from("indicadores").insert({
      nome: newName.trim(),
      comissao_percentual: newComissao,
      telefone: newTelefone || null,
      email: newEmail || null,
    } as any);
    if (error) toast.error("Erro ao adicionar");
    else {
      toast.success("Indicador adicionado!");
      setNewName(""); setNewComissao(0); setNewTelefone(""); setNewEmail("");
      refresh();
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir indicador "${nome}"?`)) return;
    const { error } = await supabase.from("indicadores").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from("indicadores").update({ ativo: !ativo } as any).eq("id", id);
    if (error) toast.error("Erro ao atualizar");
    else refresh();
  };

  const handleSave = async (id: string) => {
    const edit = editing[id];
    if (!edit) return;
    const { error } = await supabase.from("indicadores").update({
      nome: edit.nome.trim(),
      comissao_percentual: edit.comissao_percentual,
      telefone: edit.telefone || null,
      email: edit.email || null,
    } as any).eq("id", id);
    if (error) toast.error("Erro ao salvar");
    else {
      toast.success("Indicador atualizado!");
      setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
      refresh();
    }
  };

  const handlePhotoUpload = async (id: string, file: File) => {
    setUploadingId(id);
    const ext = file.name.split(".").pop();
    const path = `indicadores/${id}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Erro ao enviar foto"); setUploadingId(null); return; }
    const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
    const { error } = await supabase.from("indicadores").update({ foto_url: urlData.publicUrl } as any).eq("id", id);
    if (error) toast.error("Erro ao salvar foto");
    else { toast.success("Foto atualizada!"); refresh(); }
    setUploadingId(null);
  };

  const triggerFileUpload = (id: string) => {
    setUploadingId(id);
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingId) handlePhotoUpload(uploadingId, file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar Indicador</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nome do Indicador</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: João Silva" className="mt-1" />
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input type="number" value={newComissao} onChange={e => setNewComissao(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={newTelefone} onChange={e => setNewTelefone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemplo.com" className="mt-1" />
            </div>
          </div>
          <Button onClick={handleAdd} className="gap-2 mt-4"><Plus className="h-4 w-4" />Adicionar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Indicadores Cadastrados</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="w-14">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-28">Comissão (%)</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-20 text-center">Ativo</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {indicadores.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum indicador cadastrado</TableCell></TableRow>
              )}
              {indicadores.map(ind => {
                const edit = editing[ind.id];
                const initials = ind.nome.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <TableRow key={ind.id}>
                    <TableCell>
                      <button onClick={() => triggerFileUpload(ind.id)} className="relative group cursor-pointer" title="Alterar foto">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={ind.foto_url || undefined} />
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Upload className="h-3 w-3 text-white" />
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      {edit ? (
                        <Input value={edit.nome} onChange={e => setEditing(prev => ({ ...prev, [ind.id]: { ...prev[ind.id], nome: e.target.value } }))} className="h-8" />
                      ) : (
                        <span className="font-medium">{ind.nome}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {edit ? (
                        <Input type="number" value={edit.comissao_percentual} onChange={e => setEditing(prev => ({ ...prev, [ind.id]: { ...prev[ind.id], comissao_percentual: Number(e.target.value) } }))} min={0} max={100} step={0.5} className="h-8 w-24" />
                      ) : (
                        <span className="tabular-nums">{ind.comissao_percentual}%</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {edit ? (
                        <Input value={edit.telefone} onChange={e => setEditing(prev => ({ ...prev, [ind.id]: { ...prev[ind.id], telefone: maskPhone(e.target.value) } }))} className="h-8" placeholder="(00) 00000-0000" />
                      ) : (
                        <span className="text-sm tabular-nums">{ind.telefone || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {edit ? (
                        <Input type="email" value={edit.email} onChange={e => setEditing(prev => ({ ...prev, [ind.id]: { ...prev[ind.id], email: e.target.value } }))} className="h-8" placeholder="email@exemplo.com" />
                      ) : (
                        <span className="text-sm">{ind.email || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={ind.ativo} onCheckedChange={() => handleToggleAtivo(ind.id, ind.ativo)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {edit ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => handleSave(ind.id)}><Save className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(prev => { const n = { ...prev }; delete n[ind.id]; return n; })}><X className="h-3 w-3" /></Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(prev => ({ ...prev, [ind.id]: { nome: ind.nome, comissao_percentual: ind.comissao_percentual, telefone: ind.telefone || "", email: ind.email || "" } }))}><Pencil className="h-3 w-3" /></Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(ind.id, ind.nome)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ComissoesIndicadores />
    </div>
  );
}
