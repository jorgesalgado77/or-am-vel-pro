import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getDealRoomProviderLabel } from "@/components/admin/dealroomApiCatalog";

interface DealRoomApiConfigRow {
  id: string;
  provider: string;
  nome: string;
  is_active: boolean;
}

interface DealRoomApiShareRow {
  id: string;
  config_id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

interface TenantRow {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
}

interface Props {
  title?: string;
}

export function AdminSharedApiUsageList({ title = "Lojas usando APIs compartilhadas" }: Props) {
  const [configs, setConfigs] = useState<DealRoomApiConfigRow[]>([]);
  const [shares, setShares] = useState<DealRoomApiShareRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);

  const fetchData = async () => {
    setLoading(true);

    const [configRes, shareRes, tenantRpcRes] = await Promise.all([
      (supabase as any).from("dealroom_api_configs").select("id, provider, nome, is_active").order("nome"),
      (supabase as any).from("dealroom_api_shares").select("id, config_id, tenant_id, starts_at, ends_at, is_active, created_at").order("created_at", { ascending: false }),
      (supabase as any).rpc("admin_list_all_tenants"),
    ]);

    const missingSchema = [configRes.error, shareRes.error].some((error: any) => error?.code === "42P01");
    setSchemaReady(!missingSchema);

    if (!missingSchema) {
      setConfigs((configRes.data || []) as DealRoomApiConfigRow[]);
      setShares((shareRes.data || []) as DealRoomApiShareRow[]);
    }

    if (tenantRpcRes.data) {
      setTenants((tenantRpcRes.data as any[]).map((tenant) => ({
        id: tenant.id,
        nome_loja: tenant.nome_loja,
        codigo_loja: tenant.codigo_loja || null,
      })));
    } else {
      const { data } = await supabase.from("tenants").select("id, nome_loja, codigo_loja").order("nome_loja");
      setTenants((data || []) as TenantRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("admin-shared-dealroom-apis")
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_configs" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_shares" }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const configMap = useMemo(
    () => Object.fromEntries(configs.map((config) => [config.id, config])),
    [configs]
  );

  const tenantMap = useMemo(
    () => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants]
  );

  const rows = shares.map((share) => {
    const config = configMap[share.config_id];
    const tenant = tenantMap[share.tenant_id];
    const now = new Date();
    const startsAt = new Date(share.starts_at);
    const endsAt = new Date(share.ends_at);

    let status: "Ativo" | "Agendado" | "Expirado" | "Desativado" = "Ativo";
    let variant: "default" | "secondary" | "destructive" | "outline" = "default";

    if (!share.is_active || !config?.is_active) {
      status = "Desativado";
      variant = "secondary";
    } else if (now < startsAt) {
      status = "Agendado";
      variant = "outline";
    } else if (now > endsAt) {
      status = "Expirado";
      variant = "destructive";
    }

    return {
      ...share,
      providerLabel: getDealRoomProviderLabel(config?.provider || ""),
      tenantName: tenant?.nome_loja || "Loja não encontrada",
      tenantCode: tenant?.codigo_loja || "—",
      status,
      variant,
    };
  });

  const renewShare = async (shareId: string) => {
    const row = shares.find((item) => item.id === shareId);
    if (!row) return;

    const baseDate = new Date(row.ends_at) > new Date() ? new Date(row.ends_at) : new Date();
    const nextEnd = addDays(baseDate, 30).toISOString();

    const { error } = await (supabase as any)
      .from("dealroom_api_shares")
      .update({ ends_at: nextEnd, is_active: true, updated_at: new Date().toISOString() })
      .eq("id", shareId);

    if (error) {
      toast.error("Erro ao renovar compartilhamento: " + error.message);
      return;
    }

    toast.success("Compartilhamento renovado por 30 dias.");
    fetchData();
  };

  const deactivateShare = async (shareId: string) => {
    const { error } = await (supabase as any)
      .from("dealroom_api_shares")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", shareId);

    if (error) {
      toast.error("Erro ao desativar compartilhamento: " + error.message);
      return;
    }

    toast.success("Compartilhamento desativado.");
    fetchData();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {!schemaReady ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground">
            Execute o SQL de APIs compartilhadas para habilitar esta listagem.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>API</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim programado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma loja usando API compartilhada.</TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{row.tenantName}</p>
                      <p className="text-xs text-muted-foreground">{row.tenantCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>{row.providerLabel}</TableCell>
                  <TableCell>{format(new Date(row.starts_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell>{format(new Date(row.ends_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <Badge variant={row.variant}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => renewShare(row.id)}>Renovar</Button>
                      <Button variant="ghost" size="sm" onClick={() => deactivateShare(row.id)}>Desativar</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}