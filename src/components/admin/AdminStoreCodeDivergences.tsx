/**
 * Lists stores whose `tenants.codigo_loja` differs from `company_settings.codigo_loja`.
 * Provides a one-click "fix" that re-syncs company_settings from tenants (the source of truth).
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface DivergenceRow {
  tenant_id: string;
  nome_loja: string | null;
  company_name: string | null;
  codigo_em_tenants: string | null;
  codigo_em_company_settings: string | null;
  company_settings_id: string | null;
}

export function AdminStoreCodeDivergences() {
  const [rows, setRows] = useState<DivergenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);

  const fetchDivergences = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all tenants + their company_settings; compare client-side
      const { data: tenants, error: tErr } = await supabase
        .from("tenants")
        .select("id, nome_loja, codigo_loja");
      if (tErr) throw tErr;

      const { data: settings, error: sErr } = await supabase
        .from("company_settings")
        .select("id, tenant_id, company_name, codigo_loja");
      if (sErr) throw sErr;

      const settingsByTenant = new Map<string, any>();
      (settings || []).forEach((s: any) => {
        if (s.tenant_id) settingsByTenant.set(s.tenant_id, s);
      });

      const diverging: DivergenceRow[] = [];
      (tenants || []).forEach((t: any) => {
        const cs = settingsByTenant.get(t.id);
        const tCode = (t.codigo_loja || "").trim();
        const cCode = (cs?.codigo_loja || "").trim();
        // Diverge: ambos preenchidos e diferentes; ou tenants tem mas settings está vazio
        if (cs && tCode && cCode && tCode !== cCode) {
          diverging.push({
            tenant_id: t.id,
            nome_loja: t.nome_loja,
            company_name: cs.company_name,
            codigo_em_tenants: tCode,
            codigo_em_company_settings: cCode,
            company_settings_id: cs.id,
          });
        } else if (cs && tCode && !cCode) {
          diverging.push({
            tenant_id: t.id,
            nome_loja: t.nome_loja,
            company_name: cs.company_name,
            codigo_em_tenants: tCode,
            codigo_em_company_settings: null,
            company_settings_id: cs.id,
          });
        }
      });

      setRows(diverging);
    } catch (err) {
      console.error("[AdminStoreCodeDivergences] fetch error:", err);
      toast.error("Erro ao carregar divergências");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDivergences();
  }, [fetchDivergences]);

  const fixOne = async (row: DivergenceRow) => {
    if (!row.company_settings_id || !row.codigo_em_tenants) return;
    setFixingId(row.tenant_id);
    try {
      const { error } = await supabase
        .from("company_settings")
        .update({ codigo_loja: row.codigo_em_tenants } as any)
        .eq("id", row.company_settings_id);
      if (error) throw error;
      toast.success(`Sincronizado: ${row.nome_loja || row.tenant_id.slice(0, 8)} → ${row.codigo_em_tenants}`);
      await fetchDivergences();
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err?.message || "desconhecido"));
    } finally {
      setFixingId(null);
    }
  };

  const fixAll = async () => {
    setFixingAll(true);
    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      if (!row.company_settings_id || !row.codigo_em_tenants) continue;
      const { error } = await supabase
        .from("company_settings")
        .update({ codigo_loja: row.codigo_em_tenants } as any)
        .eq("id", row.company_settings_id);
      if (error) fail++;
      else ok++;
    }
    setFixingAll(false);
    if (ok > 0) toast.success(`${ok} loja(s) sincronizada(s)`);
    if (fail > 0) toast.error(`${fail} falha(s) ao sincronizar`);
    await fetchDivergences();
  };

  const hasDivergences = rows.length > 0;

  return (
    <Card className={hasDivergences ? "border-destructive/40" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {hasDivergences ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          Divergências de Código de Loja
          {hasDivergences && (
            <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px] rounded-full">
              {rows.length}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {hasDivergences && (
            <Button size="sm" variant="default" onClick={fixAll} disabled={fixingAll || loading} className="h-8 gap-1.5">
              {fixingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
              Sincronizar todas
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={fetchDivergences} disabled={loading} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Compara <code className="px-1 py-0.5 rounded bg-muted text-[10px]">tenants.codigo_loja</code> com{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-[10px]">company_settings.codigo_loja</code>.
          A fonte da verdade é <strong>tenants</strong>.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : !hasDivergences ? (
          <div className="flex items-center justify-center py-8 text-emerald-600 text-sm gap-2">
            <CheckCircle2 className="h-4 w-4" /> Todas as lojas estão sincronizadas.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Loja</TableHead>
                  <TableHead className="text-xs">Em <code className="text-[10px]">tenants</code></TableHead>
                  <TableHead className="text-xs">Em <code className="text-[10px]">company_settings</code></TableHead>
                  <TableHead className="text-xs text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.tenant_id}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{row.nome_loja || row.company_name || "—"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{row.tenant_id.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs border-emerald-500/40 text-emerald-600">
                        {row.codigo_em_tenants}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs border-destructive/40 text-destructive">
                        {row.codigo_em_company_settings || "(vazio)"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fixOne(row)}
                        disabled={fixingId === row.tenant_id}
                        className="h-7 gap-1.5 text-xs"
                      >
                        {fixingId === row.tenant_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        Sincronizar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
