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
  prazo_liberacao_tecnica: string;
  prazo_inicio_montagem: string;
  prazo_assistencia_tecnica: string;
  ativo: boolean;
}

const PRAZO_FIELDS = [
  { key: "prazo_entrega", label: "Prazo Entrega Loja", placeholder: "Ex: 60 dias úteis" },
  { key: "prazo_liberacao_tecnica", label: "Prazo Liberação Técnica", placeholder: "Ex: 10 dias úteis" },
  { key: "prazo_inicio_montagem", label: "Prazo Início Montagem", placeholder: "Ex: 15 dias úteis" },
  { key: "prazo_assistencia_tecnica", label: "Prazo Assistência Técnica", placeholder: "Ex: 30 dias" },
] as const;

export function ContractTypesSection() {
  const [types, setTypes] = useState<ContractType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newPrazos, setNewPrazos] = useState({ prazo_entrega: "", prazo_liberacao_tecnica: "", prazo_inicio_montagem: "", prazo_assistencia_tecnica: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPrazos, setEditPrazos] = useState({ prazo_entrega: "", prazo_liberacao_tecnica: "", prazo_inicio_montagem: "", prazo_assistencia_tecnica: "" });

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
      prazo_liberacao_tecnica: d.prazo_liberacao_tecnica || "",
      prazo_inicio_montagem: d.prazo_inicio_montagem || "",
      prazo_assistencia_tecnica: d.prazo_assistencia_tecnica || "",
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
      .insert({
        tenant_id: tenantId,
        nome: newNome.trim(),
        prazo_entrega: newPrazos.prazo_entrega.trim(),
        prazo_liberacao_tecnica: newPrazos.prazo_liberacao_tecnica.trim(),
        prazo_inicio_montagem: newPrazos.prazo_inicio_montagem.trim(),
        prazo_assistencia_tecnica: newPrazos.prazo_assistencia_tecnica.trim(),
      } as any);

    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Tipo de contrato adicionado!");
      setNewNome("");
      setNewPrazos({ prazo_entrega: "", prazo_liberacao_tecnica: "", prazo_inicio_montagem: "", prazo_assistencia_tecnica: "" });
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
    setEditPrazos({
      prazo_entrega: t.prazo_entrega,
      prazo_liberacao_tecnica: t.prazo_liberacao_tecnica,
      prazo_inicio_montagem: t.prazo_inicio_montagem,
      prazo_assistencia_tecnica: t.prazo_assistencia_tecnica,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editNome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("contract_types" as any)
      .update({
        nome: editNome.trim(),
        prazo_entrega: editPrazos.prazo_entrega.trim(),
        prazo_liberacao_tecnica: editPrazos.prazo_liberacao_tecnica.trim(),
        prazo_inicio_montagem: editPrazos.prazo_inicio_montagem.trim(),
        prazo_assistencia_tecnica: editPrazos.prazo_assistencia_tecnica.trim(),
        updated_at: new Date().toISOString(),
      } as any)
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
        <div className="space-y-3 p-4 rounded-lg border border-dashed border-border bg-muted/20">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-medium">Nome do Tipo</Label>
              <Input
                value={newNome}
                onChange={e => setNewNome(e.target.value)}
                placeholder="Ex: Projeto Completo"
                className="h-9 text-sm"
              />
            </div>
            <Button onClick={handleAdd} disabled={saving} size="sm" className="gap-1.5 h-9">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PRAZO_FIELDS.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{f.label}</Label>
                <Input
                  value={newPrazos[f.key]}
                  onChange={e => setNewPrazos(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* List */}
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum tipo de contrato cadastrado.
          </p>
        ) : (
          <div className="space-y-2">
            {types.map(t => (
              <div key={t.id} className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                {editingId === t.id ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="h-8 text-sm flex-1" placeholder="Nome" />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={handleSaveEdit} disabled={saving}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {PRAZO_FIELDS.map(f => (
                        <div key={f.key} className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                          <Input
                            value={editPrazos[f.key]}
                            onChange={e => setEditPrazos(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="h-7 text-xs"
                            placeholder={f.placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs font-semibold">{t.nome}</Badge>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {PRAZO_FIELDS.map(f => {
                        const val = t[f.key];
                        return val ? (
                          <span key={f.key}>{f.label}: <span className="text-foreground">{val}</span></span>
                        ) : null;
                      })}
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
