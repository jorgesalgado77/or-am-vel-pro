import { useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wifi, WifiOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AdminSharedApiUsageList } from "@/components/admin/AdminSharedApiUsageList";
import { DEALROOM_API_CATALOG, type DealRoomProviderKey } from "@/components/admin/dealroomApiCatalog";

interface TenantRow {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
  ativo: boolean;
}

interface DealRoomApiConfigRow {
  id: string;
  provider: DealRoomProviderKey;
  nome: string;
  categoria: string;
  credenciais: Record<string, string>;
  configuracoes: Record<string, string>;
  is_active: boolean;
}

interface DealRoomApiShareRow {
  id: string;
  config_id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

interface DraftState {
  credenciais: Record<string, string>;
  configuracoes: Record<string, string>;
  is_active: boolean;
}

const formatForInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const toIso = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export function DealRoomApiManager() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [configs, setConfigs] = useState<DealRoomApiConfigRow[]>([]);
  const [shares, setShares] = useState<DealRoomApiShareRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareProvider, setShareProvider] = useState<DealRoomProviderKey | "">("");
  const [shareTenantId, setShareTenantId] = useState("");
  const [shareStartsAt, setShareStartsAt] = useState("");
  const [shareEndsAt, setShareEndsAt] = useState("");
  const [shareSaving, setShareSaving] = useState(false);
  const [providerSaving, setProviderSaving] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error" | null>>({});

  const fetchData = async () => {
    setLoading(true);

    const [tenantRpcRes, configRes, shareRes] = await Promise.all([
      (supabase as any).rpc("admin_list_all_tenants"),
      (supabase as any).from("dealroom_api_configs").select("*").order("nome"),
      (supabase as any).from("dealroom_api_shares").select("*").order("created_at", { ascending: false }),
    ]);

    const missingSchema = [configRes.error, shareRes.error].some((error: any) => error?.code === "42P01");
    setSchemaReady(!missingSchema);

    if (tenantRpcRes.data) {
      setTenants((tenantRpcRes.data as any[]).map((tenant) => ({
        id: tenant.id,
        nome_loja: tenant.nome_loja,
        codigo_loja: tenant.codigo_loja || null,
        ativo: tenant.ativo,
      })));
    } else {
      const { data } = await supabase.from("tenants").select("id, nome_loja, codigo_loja, ativo").order("nome_loja");
      setTenants((data || []) as TenantRow[]);
    }

    if (!missingSchema) {
      setConfigs(((configRes.data || []) as any[]).map((row) => ({
        ...row,
        credenciais: (row.credenciais as Record<string, string>) || {},
        configuracoes: (row.configuracoes as Record<string, string>) || {},
      })));
      setShares((shareRes.data || []) as DealRoomApiShareRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("dealroom-api-manager")
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_configs" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_shares" }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const nextDrafts: Record<string, DraftState> = {};
    DEALROOM_API_CATALOG.forEach((definition) => {
      const existing = configs.find((config) => config.provider === definition.provider);
      nextDrafts[definition.provider] = {
        credenciais: { ...(existing?.credenciais || {}) },
        configuracoes: { ...(existing?.configuracoes || {}) },
        is_active: existing?.is_active || false,
      };
    });
    setDrafts(nextDrafts);
  }, [configs]);

  const activeSharesCount = useMemo(
    () => shares.filter((share) => share.is_active && new Date(share.ends_at) > new Date()).length,
    [shares]
  );

  const providerShareCount = (provider: DealRoomProviderKey) => {
    const config = configs.find((row) => row.provider === provider);
    if (!config) return 0;
    return shares.filter((share) => share.config_id === config.id && share.is_active && new Date(share.ends_at) > new Date()).length;
  };

  const upsertProviderConfig = async (provider: DealRoomProviderKey) => {
    const definition = DEALROOM_API_CATALOG.find((item) => item.provider === provider);
    const draft = drafts[provider];
    if (!definition || !draft) {
      throw new Error("Configuração inválida do provider.");
    }

    const payload = {
      provider,
      nome: definition.label,
      categoria: definition.category,
      credenciais: draft.credenciais,
      configuracoes: draft.configuracoes,
      is_active: draft.is_active,
      updated_at: new Date().toISOString(),
      created_by: "admin_master",
    };

    const { data, error } = await (supabase as any)
      .from("dealroom_api_configs")
      .upsert(payload, { onConflict: "provider" })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as DealRoomApiConfigRow;
  };

  const saveProvider = async (provider: DealRoomProviderKey) => {
    setProviderSaving(provider);
    try {
      await upsertProviderConfig(provider);
      toast.success("Configuração salva em tempo real.");
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao salvar configuração: " + (error?.message || "desconhecido"));
    } finally {
      setProviderSaving(null);
    }
  };

  const testConnection = async (provider: DealRoomProviderKey) => {
    const definition = DEALROOM_API_CATALOG.find((item) => item.provider === provider);
    const draft = drafts[provider];
    if (!definition || !draft) return;

    const requiredFields = definition.fields.filter((f) => f.required);
    const missingFields = requiredFields.filter((f) => {
      const group = f.group === "configuracoes" ? "configuracoes" : "credenciais";
      return !draft[group][f.key];
    });

    if (missingFields.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missingFields.map((f) => f.label).join(", ")}`);
      setTestResults((prev) => ({ ...prev, [provider]: "error" }));
      return;
    }

    setTestingProvider(provider);
    setTestResults((prev) => ({ ...prev, [provider]: null }));

    try {
      // Test based on provider type
      let testUrl = "";
      let testHeaders: Record<string, string> = {};

      switch (provider) {
        case "openai":
          testUrl = "https://api.openai.com/v1/models";
          testHeaders = { Authorization: `Bearer ${draft.credenciais.api_key}` };
          break;
        case "daily":
          testUrl = "https://api.daily.co/v1/rooms";
          testHeaders = { Authorization: `Bearer ${draft.credenciais.api_key}` };
          break;
        case "stripe":
          testUrl = "https://api.stripe.com/v1/balance";
          testHeaders = { Authorization: `Bearer ${draft.credenciais.secret_key}` };
          break;
        case "livekit":
          // LiveKit needs server-side validation; check if URL is reachable
          if (draft.configuracoes.ws_url) {
            testUrl = draft.configuracoes.ws_url.replace("wss://", "https://").replace("ws://", "http://");
          }
          break;
        default:
          // For providers without direct test endpoints, validate fields are filled
          toast.success(`Campos de ${definition.label} validados com sucesso.`);
          setTestResults((prev) => ({ ...prev, [provider]: "success" }));
          setTestingProvider(null);
          return;
      }

      if (testUrl) {
        const { data } = await supabase.functions.invoke("onboarding-ai", {
          body: {
            action: "validate_api_key",
            provider: provider === "stripe" ? "stripe" : provider === "daily" ? "daily" : provider,
            api_key: draft.credenciais.api_key || draft.credenciais.secret_key || "",
            api_url: testUrl,
          },
        });

        if (data?.valid) {
          toast.success(`✅ ${definition.label} conectada com sucesso!`);
          setTestResults((prev) => ({ ...prev, [provider]: "success" }));
        } else {
          toast.error(`❌ ${definition.label}: ${data?.error || "Falha na conexão"}`);
          setTestResults((prev) => ({ ...prev, [provider]: "error" }));
        }
      }
    } catch {
      // Fallback: if edge function is unavailable, do basic field validation
      toast.success(`Campos de ${definition.label} validados. Teste direto indisponível.`);
      setTestResults((prev) => ({ ...prev, [provider]: "success" }));
    } finally {
      setTestingProvider(null);
    }
  };

  const isProviderConnected = (provider: DealRoomProviderKey): boolean => {
    const config = configs.find((c) => c.provider === provider);
    if (!config || !config.is_active) return false;
    const definition = DEALROOM_API_CATALOG.find((d) => d.provider === provider);
    if (!definition) return false;
    const requiredFields = definition.fields.filter((f) => f.required);
    return requiredFields.every((f) => {
      const group = f.group === "configuracoes" ? "configuracoes" : "credenciais";
      return !!config[group]?.[f.key];
    });
  };

  const openShareDialog = (provider: DealRoomProviderKey) => {
    const now = new Date();
    setShareProvider(provider);
    setShareTenantId("");
    setShareStartsAt(formatForInput(now.toISOString()));
    setShareEndsAt(formatForInput(addDays(now, 30).toISOString()));
    setShareDialogOpen(true);
  };

  const saveShare = async () => {
    if (!shareProvider || !shareTenantId || !shareEndsAt) {
      toast.error("Selecione a loja e o período do compartilhamento.");
      return;
    }

    setShareSaving(true);
    try {
      const config = await upsertProviderConfig(shareProvider);

      const { error } = await (supabase as any)
        .from("dealroom_api_shares")
        .upsert(
          {
            config_id: config.id,
            tenant_id: shareTenantId,
            starts_at: toIso(shareStartsAt),
            ends_at: toIso(shareEndsAt),
            is_active: true,
            shared_by: "admin_master",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "config_id,tenant_id" }
        );

      if (error) {
        throw new Error(error.message);
      }

      toast.success("Compartilhamento salvo e sincronizado em tempo real.");
      setShareDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao compartilhar API: " + (error?.message || "desconhecido"));
    } finally {
      setShareSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{DEALROOM_API_CATALOG.length}</p>
            <p className="text-xs text-muted-foreground">Providers suportados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{configs.filter((item) => item.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Configs ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{activeSharesCount}</p>
            <p className="text-xs text-muted-foreground">Compartilhamentos ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{tenants.filter((tenant) => tenant.ativo).length}</p>
            <p className="text-xs text-muted-foreground">Lojas elegíveis</p>
          </CardContent>
        </Card>
      </div>

      {!schemaReady ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Execute o SQL de APIs compartilhadas para habilitar os campos e os compartilhamentos do Deal Room.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuração real das APIs do Deal Room</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="space-y-2">
              {DEALROOM_API_CATALOG.map((definition) => {
                const draft = drafts[definition.provider] || { credenciais: {}, configuracoes: {}, is_active: false };
                const activeShares = providerShareCount(definition.provider);

                return (
                  <AccordionItem key={definition.provider} value={definition.provider} className="rounded-lg border px-4">
                    <AccordionTrigger className="py-3">
                      <div className="flex flex-wrap items-center gap-2 text-left">
                        <span className="font-medium">{definition.label}</span>
                        <Badge variant="secondary" className="text-[10px]">{definition.badge}</Badge>
                        <Badge variant={draft.is_active ? "default" : "outline"} className="text-[10px]">
                          {draft.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{activeShares} loja(s)</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <p className="text-sm text-muted-foreground">{definition.description}</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        {definition.fields.map((field) => {
                          const group = field.group === "configuracoes" ? "configuracoes" : "credenciais";
                          const value = draft[group][field.key] || "";

                          return (
                            <div key={field.key} className="space-y-2">
                              <Label>{field.label}</Label>
                              <Input
                                type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                                placeholder={field.placeholder}
                                value={value}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setDrafts((current) => ({
                                    ...current,
                                    [definition.provider]: {
                                      ...current[definition.provider],
                                      [group]: {
                                        ...current[definition.provider]?.[group],
                                        [field.key]: nextValue,
                                      },
                                    },
                                  }));
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">Ativar provider</p>
                          <p className="text-xs text-muted-foreground">Controla em tempo real a disponibilidade deste provider para compartilhamento.</p>
                        </div>
                        <Switch
                          checked={draft.is_active}
                          onCheckedChange={(checked) => {
                            setDrafts((current) => ({
                              ...current,
                              [definition.provider]: {
                                ...current[definition.provider],
                                is_active: checked,
                              },
                            }));
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => saveProvider(definition.provider)} disabled={providerSaving === definition.provider}>
                          {providerSaving === definition.provider ? "Salvando..." : "Salvar configuração"}
                        </Button>
                        <Button variant="outline" onClick={() => openShareDialog(definition.provider)}>
                          Compartilhar com loja
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}

      <AdminSharedApiUsageList title="Compartilhamentos programados do Deal Room" />

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartilhar API com loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API</Label>
              <Input value={DEALROOM_API_CATALOG.find((item) => item.provider === shareProvider)?.label || ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={shareTenantId} onValueChange={setShareTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.filter((tenant) => tenant.ativo).map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.nome_loja} {tenant.codigo_loja ? `• ${tenant.codigo_loja}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início do uso</Label>
                <Input type="datetime-local" value={shareStartsAt} onChange={(event) => setShareStartsAt(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim programado</Label>
                <Input type="datetime-local" value={shareEndsAt} onChange={(event) => setShareEndsAt(event.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveShare} disabled={shareSaving}>{shareSaving ? "Salvando..." : "Salvar compartilhamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}