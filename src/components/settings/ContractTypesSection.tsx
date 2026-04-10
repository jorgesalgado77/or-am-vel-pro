import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";

interface ContractType {
  id: string;
  nome: string;
  prazo_entrega: string;
  ativo: boolean;
}

export function ContractTypesSection() {
  const [types, setTypes] = useState<ContractType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newPrazo, setNewPrazo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPrazo, setEditPrazo] = useState("");

  const fetchTypes = async () => {
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }
    const { data } = await supabase
      .from("contract_types" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at");
    setTypes((data as any[] || []).map((d: any) => ({
      id: d.id,
      nome: d.nome,
      prazo_entrega: d.prazo_entrega || "",
      ativo: d.ativo !== false,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchTypes(); }, []);

  const handleAdd = async () => {
    if (!newNome.trim()) { toast.error("Informe o nome do tipo de contrato"); return; }
    setSaving(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { toast.error("Tenant não encontrado"); setSaving(false); return; }

    const { error } = await supabase
      .from("contract_types" as any)
      .insert({ tenant_id: tenantId, nome: newNome.trim(), prazo_entrega: newPrazo.trim() } as any);

    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Tipo de contrato adicionado!");
      setNewNome("");
      setNewPrazo("");
      fetchTypes();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("contract_types" as any)
      .delete()
      .eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else {
      setTypes(prev => prev.filter(t => t.id !== id));
      toast.success("Tipo removido");
    }
  };

  const startEdit = (t: ContractType) => {
    setEditingId(t.id);
    setEditNome(t.nome);
    setEditPrazo(t.prazo_entrega);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editNome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("contract_types" as any)
      .update({ nome: editNome.trim(), prazo_entrega: editPrazo.trim(), updated_at: new Date().toISOString() } as any)
      .eq("id", editingId);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Tipo atualizado!");
      setEditingId(null);
      fetchTypes();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Tipos de Contrato</CardTitle>
        </div>
        <CardDescription>
          Cadastre os tipos de contrato disponíveis para seleção no fechamento de venda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Nome do Tipo</Label>
            <Input
              value={newNome}
              onChange={e => setNewNome(e.target.value)}
              placeholder="Ex: Projeto Completo"
              className="h-9 text-sm"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Prazo de Entrega</Label>
            <Input
              value={newPrazo}
              onChange={e => setNewPrazo(e.target.value)}
              placeholder="Ex: 45 dias úteis"
              className="h-9 text-sm"
            />
          </div>
          <Button onClick={handleAdd} disabled={saving} size="sm" className="gap-1.5 h-9">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {/* List */}
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum tipo de contrato cadastrado.
          </p>
        ) : (
          <div className="space-y-2">
            {types.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 gap-2">
                {editingId === t.id ? (
                  <>
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="h-8 text-sm flex-1" placeholder="Nome" />
                      <Input value={editPrazo} onChange={e => setEditPrazo(e.target.value)} className="h-8 text-sm flex-1" placeholder="Prazo" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={handleSaveEdit} disabled={saving}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{t.nome}</Badge>
                      {t.prazo_entrega && (
                        <span className="text-xs text-muted-foreground">Prazo: {t.prazo_entrega}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
