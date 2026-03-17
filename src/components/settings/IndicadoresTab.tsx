import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIndicadores } from "@/hooks/useIndicadores";

export function IndicadoresTab() {
  const { indicadores, refresh } = useIndicadores();
  const [newName, setNewName] = useState("");
  const [newComissao, setNewComissao] = useState(0);
  const [editing, setEditing] = useState<Record<string, { nome: string; comissao_percentual: number }>>({});

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from("indicadores").insert({
      nome: newName.trim(),
      comissao_percentual: newComissao,
    } as any);
    if (error) toast.error("Erro ao adicionar");
    else { toast.success("Indicador adicionado!"); setNewName(""); setNewComissao(0); refresh(); }
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
    } as any).eq("id", id);
    if (error) toast.error("Erro ao salvar");
    else {
      toast.success("Indicador atualizado!");
      setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar Indicador</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Nome do Indicador</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: João Silva" className="mt-1" />
            </div>
            <div className="w-40">
              <Label>Comissão (%)</Label>
              <Input type="number" value={newComissao} onChange={e => setNewComissao(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
            </div>
            <Button onClick={handleAdd} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Indicadores Cadastrados</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead>Nome</TableHead>
                <TableHead className="w-32">Comissão (%)</TableHead>
                <TableHead className="w-24 text-center">Ativo</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {indicadores.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum indicador cadastrado</TableCell></TableRow>
              )}
              {indicadores.map(ind => {
                const edit = editing[ind.id];
                return (
                  <TableRow key={ind.id}>
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
                          <Button size="sm" variant="ghost" onClick={() => setEditing(prev => ({ ...prev, [ind.id]: { nome: ind.nome, comissao_percentual: ind.comissao_percentual } }))}><Pencil className="h-3 w-3" /></Button>
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
    </div>
  );
}
