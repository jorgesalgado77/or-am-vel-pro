import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Pencil, X, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useCargos, type CargoPermissoes } from "@/hooks/useCargos";
import { getTenantId } from "@/lib/tenantState";

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
  const [editComissao, setEditComissao] = useState<Record<string, number>>({});

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Sessão inválida, faça login novamente"); return; }
    const { error } = await supabase.from("cargos").insert({ nome: newName.trim(), permissoes: DEFAULT_PERMISSOES as any, tenant_id: tenantId });
    if (error) { toast.error("Erro ao adicionar cargo: " + error.message); console.error(error); }
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

  const hasChanges = (cargoId: string) => editPerms[cargoId] || editingName[cargoId] !== undefined || editComissao[cargoId] !== undefined;

  const handleSave = async (cargoId: string) => {
    const perms = editPerms[cargoId];
    const newNome = editingName[cargoId];
    const newComissao = editComissao[cargoId];
    const updates: any = {};
    if (perms) updates.permissoes = perms;
    if (newNome !== undefined) updates.nome = newNome.trim();
    if (newComissao !== undefined) updates.comissao_percentual = newComissao;
    if (Object.keys(updates).length === 0) return;
    const { error } = await supabase.from("cargos").update(updates).eq("id", cargoId);
    if (error) toast.error("Erro ao salvar");
    else {
      toast.success("Cargo salvo!");
      setEditPerms(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
      setEditingName(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
      setEditComissao(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
      refresh();
    }
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
        const comissao = editComissao[cargo.id] ?? cargo.comissao_percentual;
        return (
          <Card key={cargo.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                {editingName[cargo.id] !== undefined ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingName[cargo.id]}
                      onChange={e => setEditingName(prev => ({ ...prev, [cargo.id]: e.target.value }))}
                      className="h-8 w-48"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(prev => { const n = { ...prev }; delete n[cargo.id]; return n; })}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{cargo.nome}</CardTitle>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(prev => ({ ...prev, [cargo.id]: cargo.nome }))}><Pencil className="h-3 w-3" /></Button>
                  </div>
                )}
                <div className="flex gap-2">
                  {hasChanges(cargo.id) && (
                    <Button size="sm" onClick={() => handleSave(cargo.id)} className="gap-1"><Save className="h-3 w-3" />Salvar</Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(cargo.id, cargo.nome)} className="gap-1"><Trash2 className="h-3 w-3" />Excluir</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Commission percentage */}
              <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex-1">
                  <Label className="text-xs font-medium">Comissão sobre vendas (%)</Label>
                  <p className="text-[10px] text-muted-foreground">Percentual calculado sobre o valor à vista da venda</p>
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={comissao}
                    onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))}
                    className="h-8 text-sm text-right"
                  />
                </div>
              </div>

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
