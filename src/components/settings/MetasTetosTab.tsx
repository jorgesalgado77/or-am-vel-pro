/**
 * MetasTetosTab — Settings tab for Metas e Tetos (Goals & Ceilings)
 * Admin/Gerente can define: Meta Geral Loja, Meta Vendedor/Projetista, Teto Máximo Liberação
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Target, Plus, Pencil, Trash2, Store, Users, ShieldAlert, Loader2, DollarSign } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MetaTeto {
  id: string;
  tenant_id: string;
  tipo: "meta_loja" | "meta_vendedor" | "teto_liberacao" | "custom";
  label: string;
  valor: number;
  mes_referencia: string; // YYYY-MM
  created_at: string;
}

const TIPO_CONFIG: Record<string, { label: string; icon: typeof Target; color: string }> = {
  meta_loja: { label: "Meta Geral Loja", icon: Store, color: "text-primary" },
  meta_vendedor: { label: "Meta Vendedor/Projetista", icon: Users, color: "text-emerald-600" },
  teto_liberacao: { label: "Teto Máximo Liberação", icon: ShieldAlert, color: "text-destructive" },
  custom: { label: "Meta Personalizada", icon: Target, color: "text-blue-600" },
};

function formatCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function MetasTetosTab() {
  const { currentUser } = useCurrentUser();
  const [metas, setMetas] = useState<MetaTeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [form, setForm] = useState({
    id: "",
    tipo: "meta_loja" as MetaTeto["tipo"],
    label: "",
    valor: 0,
  });

  const isAdmin = currentUser?.cargo_nome?.toLowerCase() === "administrador";
  const isGerente = currentUser?.cargo_nome?.toLowerCase() === "gerente";
  const canEdit = isAdmin || isGerente;

  const storageKey = useCallback((tenantId: string) => `metas_tetos_${tenantId}_${selectedMonth}`, [selectedMonth]);

  const loadMetas = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("sales_goals" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("month", selectedMonth)
      .in("goal_type", ["meta_loja", "meta_vendedor", "teto_liberacao", "custom"]);

    if (!error && data && (data as any[]).length > 0) {
      setMetas((data as any[]).map((d: any) => ({
        id: d.id,
        tenant_id: d.tenant_id,
        tipo: d.goal_type,
        label: d.user_id || TIPO_CONFIG[d.goal_type]?.label || "Meta",
        valor: d.target_value,
        mes_referencia: d.month,
        created_at: d.created_at,
      })));
    } else {
      // Fallback to localStorage
      const stored = localStorage.getItem(storageKey(tenantId));
      if (stored) {
        setMetas(JSON.parse(stored));
      } else {
        setMetas([]);
      }
    }
    setLoading(false);
  }, [selectedMonth, storageKey]);

  useEffect(() => { loadMetas(); }, [loadMetas]);

  const handleSave = async () => {
    if (form.valor <= 0) { toast.error("Valor deve ser maior que zero"); return; }
    setSaving(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setSaving(false); return; }

    const label = form.label || TIPO_CONFIG[form.tipo]?.label || "Meta";

    const payload = {
      tenant_id: tenantId,
      user_id: label,
      goal_type: form.tipo,
      target_value: form.valor,
      month: selectedMonth,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("sales_goals" as any).update(payload as any).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("sales_goals" as any).insert(payload as any));
    }

    if (error) {
      // Fallback localStorage
      const key = storageKey(tenantId);
      const stored: MetaTeto[] = JSON.parse(localStorage.getItem(key) || "[]");
      const newMeta: MetaTeto = {
        ...{ tenant_id: tenantId, tipo: form.tipo, label, valor: form.valor, mes_referencia: selectedMonth },
        id: form.id || crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      if (form.id) {
        const idx = stored.findIndex(m => m.id === form.id);
        if (idx >= 0) stored[idx] = newMeta; else stored.push(newMeta);
      } else {
        stored.push(newMeta);
      }
      localStorage.setItem(key, JSON.stringify(stored));
      setMetas(stored);
      toast.success("Meta salva (local)!");
    } else {
      toast.success("Meta salva!");
      await loadMetas();
    }

    setDialogOpen(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setMetas(prev => prev.filter(m => m.id !== id));
    const { error } = await supabase.from("sales_goals" as any).delete().eq("id", id);
    if (error) {
      const tenantId = await getResolvedTenantId();
      if (tenantId) {
        const key = storageKey(tenantId);
        const stored = JSON.parse(localStorage.getItem(key) || "[]").filter((m: any) => m.id !== id);
        localStorage.setItem(key, JSON.stringify(stored));
      }
    }
    toast.success("Meta removida");
  };

  const openNew = (tipo?: MetaTeto["tipo"]) => {
    setForm({ id: "", tipo: tipo || "meta_loja", label: "", valor: 0 });
    setDialogOpen(true);
  };

  const openEdit = (m: MetaTeto) => {
    setForm({ id: m.id, tipo: m.tipo, label: m.label, valor: m.valor });
    setDialogOpen(true);
  };

  // Month options
  const monthOptions = [];
  for (let i = -2; i <= 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    monthOptions.push({ value: val, label });
  }

  const metaLoja = metas.find(m => m.tipo === "meta_loja");
  const metaVendedor = metas.find(m => m.tipo === "meta_vendedor");
  const tetoLib = metas.find(m => m.tipo === "teto_liberacao");
  const customMetas = metas.filter(m => m.tipo === "custom");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Metas e Tetos</h2>
          <p className="text-sm text-muted-foreground">Defina metas mensais e tetos de liberação para a equipe</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => (
              <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Main cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Meta Geral Loja */}
            <Card className="border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" /> Meta Geral Loja
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metaLoja ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-primary">{formatCurrency(metaLoja.valor)}</p>
                    <p className="text-xs text-muted-foreground">Meta mensal total da loja</p>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(metaLoja)}>
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(metaLoja.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">Nenhuma meta definida</p>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => openNew("meta_loja")}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Definir Meta
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Meta Vendedor/Projetista */}
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" /> Meta Vendedor/Projetista
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metaVendedor ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(metaVendedor.valor)}</p>
                    <p className="text-xs text-muted-foreground">Meta padrão individual mensal</p>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(metaVendedor)}>
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(metaVendedor.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">Nenhuma meta definida</p>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => openNew("meta_vendedor")}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Definir Meta
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Teto Máximo Liberação */}
            <Card className="border-destructive/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" /> Teto Máximo Liberação
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tetoLib ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-destructive">{formatCurrency(tetoLib.valor)}</p>
                    <p className="text-xs text-muted-foreground">Valor máximo de liberação</p>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(tetoLib)}>
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(tetoLib.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">Nenhum teto definido</p>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => openNew("teto_liberacao")}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Definir Teto
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Custom metas */}
          {customMetas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Metas Personalizadas</h3>
              {customMetas.map(m => {
                const cfg = TIPO_CONFIG[m.tipo];
                return (
                  <Card key={m.id}>
                    <CardContent className="pt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <DollarSign className={cn("h-5 w-5", cfg.color)} />
                        <div>
                          <p className="text-sm font-medium">{m.label}</p>
                          <p className="text-lg font-bold">{formatCurrency(m.valor)}</p>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Add custom */}
          {canEdit && (
            <Button variant="outline" className="gap-2" onClick={() => openNew("custom")}>
              <Plus className="h-4 w-4" /> Criar nova meta ou teto
            </Button>
          )}

          {!canEdit && (
            <p className="text-xs text-muted-foreground italic">Somente administradores e gerentes podem editar metas e tetos.</p>
          )}
        </>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Nova"} Meta / Teto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as MetaTeto["tipo"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta_loja">Meta Geral Loja</SelectItem>
                  <SelectItem value="meta_vendedor">Meta Vendedor/Projetista</SelectItem>
                  <SelectItem value="teto_liberacao">Teto Máximo Liberação</SelectItem>
                  <SelectItem value="custom">Meta Personalizada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === "custom" && (
              <div>
                <Label>Nome da Meta</Label>
                <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Meta Showroom" />
              </div>
            )}
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                min={0}
                value={form.valor || ""}
                onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))}
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
