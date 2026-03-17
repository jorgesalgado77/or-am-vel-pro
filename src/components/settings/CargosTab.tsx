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
import { useCargos, type CargoPermissoes } from "@/hooks/useCargos";

const PERM_LABELS: Record<keyof CargoPermissoes, string> = {
  clientes: "Clientes",
  simulador: "Simulador",
  configuracoes: "Configurações",
  desconto1: "Desconto 1",
  desconto2: "Desconto 2",
  desconto3: "Desconto 3",
  plus: "Plus",
};

export function CargosTab() {
  const { cargos, refresh, DEFAULT_PERMISSOES } = useCargos();
  const [newName, setNewName] = useState("");
  const [editPerms, setEditPerms] = useState<Record<string, CargoPermissoes>>({});
  const [editingName, setEditingName] = useState<Record<string, string>>({});

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from("cargos").insert({ nome: newName.trim(), permissoes: DEFAULT_PERMISSOES as any });
    if (error) toast.error("Erro ao adicionar cargo");
    else { toast.success("Cargo adicionado!"); setNewName(""); refresh(); }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir cargo "${nome}"?`)) return;
    const { error } = await supabase.from("cargos").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const togglePerm = (cargoId: string, current: CargoPermissoes, key: keyof CargoPermissoes) => {
    const existing = editPerms[cargoId] || { ...current };
    setEditPerms(prev => ({ ...prev, [cargoId]: { ...existing, [key]: !existing[key] } }));
  };

  const handleSave = async (cargoId: string) => {
    const perms = editPerms[cargoId];
    if (!perms) return;
    const { error } = await supabase.from("cargos").update({ permissoes: perms as any }).eq("id", cargoId);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Permissões salvas!"); setEditPerms(prev => { const n = { ...prev }; delete n[cargoId]; return n; }); refresh(); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar Cargo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Nome do Cargo</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Vendedor" className="mt-1" />
            </div>
            <Button onClick={handleAdd} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      {cargos.map(cargo => {
        const perms = editPerms[cargo.id] || cargo.permissoes;
        return (
          <Card key={cargo.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{cargo.nome}</CardTitle>
                <div className="flex gap-2">
                  {editPerms[cargo.id] && (
                    <Button size="sm" onClick={() => handleSave(cargo.id)} className="gap-1"><Save className="h-3 w-3" />Salvar</Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(cargo.id, cargo.nome)} className="gap-1"><Trash2 className="h-3 w-3" />Excluir</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>Função</TableHead>
                    <TableHead className="w-24 text-center">Acesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Object.keys(PERM_LABELS) as Array<keyof CargoPermissoes>).map(key => (
                    <TableRow key={key}>
                      <TableCell>{PERM_LABELS[key]}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={perms[key]} onCheckedChange={() => togglePerm(cargo.id, cargo.permissoes, key)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
