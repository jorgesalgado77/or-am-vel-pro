import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { KeyRound, Plus, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Store, Shield } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { API_PROVIDERS, type ApiProvider } from "@/hooks/useApiKeys";

interface Tenant {
  id: string;
  nome_loja: string;
  plano: string;
  ativo: boolean;
}

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  provider: string;
  api_key: string;
  api_url: string | null;
  is_active: boolean;
  created_at: string;
}

export function AdminApiKeys() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [dialogTenant, setDialogTenant] = useState("");
  const [dialogProvider, setDialogProvider] = useState<ApiProvider | "">("");
  const [dialogKey, setDialogKey] = useState("");
  const [dialogUrl, setDialogUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTenants();
    fetchKeys();
  }, []);

  const fetchTenants = async () => {
    const { data } = await (supabase as any).rpc("admin_list_all_tenants");
    if (data) setTenants(data.map((t: any) => ({ id: t.id, nome_loja: t.nome_loja, plano: t.plano, ativo: t.ativo })));
  };

  const fetchKeys = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("api_keys").select("*").order("created_at", { ascending: false });
    if (data) setKeys(data);
    setLoading(false);
  };

  const filteredKeys = selectedTenant === "all" ? keys : keys.filter(k => k.tenant_id === selectedTenant);
  const tenantName = (id: string) => tenants.find(t => t.id === id)?.nome_loja || "—";

  const maskKey = (key: string) => key.length <= 8 ? "••••••••" : key.slice(0, 4) + "••••••••" + key.slice(-4);

  const handleSave = async () => {
    if (!dialogTenant || !dialogProvider || !dialogKey.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);

    const existing = keys.find(k => k.tenant_id === dialogTenant && k.provider === dialogProvider);
    if (existing) {
      await (supabase as any).from("api_keys").update({ api_key: dialogKey.trim(), api_url: dialogUrl.trim() || null, is_active: true }).eq("id", existing.id);
    } else {
      await (supabase as any).from("api_keys").insert({ tenant_id: dialogTenant, provider: dialogProvider, api_key: dialogKey.trim(), api_url: dialogUrl.trim() || null, is_active: true });
    }

    toast.success("API key salva");
    setShowDialog(false);
    setDialogTenant("");
    setDialogProvider("");
    setDialogKey("");
    setDialogUrl("");
    setSaving(false);
    fetchKeys();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await (supabase as any).from("api_keys").update({ is_active: active }).eq("id", id);
    fetchKeys();
  };

  const deleteApiKey = async (id: string) => {
    if (!confirm("Remover esta API key?")) return;
    await (supabase as any).from("api_keys").delete().eq("id", id);
    toast.success("API key removida");
    fetchKeys();
  };

  const providerLabel = (p: string) => API_PROVIDERS.find(x => x.value === p)?.label || p;

  // Summary: count of providers per tenant
  const summary = tenants.map(t => {
    const tKeys = keys.filter(k => k.tenant_id === t.id);
    return { ...t, totalKeys: tKeys.length, activeKeys: tKeys.filter(k => k.is_active).length };
  }).filter(t => t.totalKeys > 0 || selectedTenant === "all");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Gestão de APIs por Loja</h3>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger className="w-56 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Lojas</SelectItem>
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.nome_loja}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowDialog(true)} className="gap-1 h-8">
            <Plus className="h-3 w-3" /> Adicionar API
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{keys.length}</p>
            <p className="text-xs text-muted-foreground">Total de APIs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{keys.filter(k => k.is_active).length}</p>
            <p className="text-xs text-muted-foreground">APIs Ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{new Set(keys.map(k => k.tenant_id)).size}</p>
            <p className="text-xs text-muted-foreground">Lojas com APIs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{new Set(keys.map(k => k.provider)).size}</p>
            <p className="text-xs text-muted-foreground">Providers Usados</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma API key cadastrada
                  </TableCell>
                </TableRow>
              ) : filteredKeys.map(k => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium text-sm">{tenantName(k.tenant_id)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{providerLabel(k.provider)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">
                        {visibleKeys.has(k.id) ? k.api_key : maskKey(k.api_key)}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setVisibleKeys(prev => {
                          const n = new Set(prev);
                          n.has(k.id) ? n.delete(k.id) : n.add(k.id);
                          return n;
                        });
                      }}>
                        {visibleKeys.has(k.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{k.api_url || "—"}</TableCell>
                  <TableCell>
                    <Switch checked={k.is_active} onCheckedChange={v => toggleActive(k.id, v)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteApiKey(k.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Loja</Label>
              <Select value={dialogTenant} onValueChange={setDialogTenant}>
                <SelectTrigger><SelectValue placeholder="Selecione a loja..." /></SelectTrigger>
                <SelectContent>
                  {tenants.filter(t => t.ativo).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.nome_loja}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={dialogProvider} onValueChange={v => setDialogProvider(v as ApiProvider)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {API_PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label} — {p.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>API Key</Label>
              <Input type="password" value={dialogKey} onChange={e => setDialogKey(e.target.value)} placeholder="sk-..." />
            </div>
            {dialogProvider && API_PROVIDERS.find(p => p.value === dialogProvider)?.urlRequired && (
              <div>
                <Label>URL da API</Label>
                <Input value={dialogUrl} onChange={e => setDialogUrl(e.target.value)} placeholder="https://..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
