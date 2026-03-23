import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar } from "lucide-react";
import { startOfMonth, subDays, subMonths, startOfYear, subYears, endOfDay, startOfDay } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type DatePreset = "mes_atual" | "30dias" | "60dias" | "90dias" | "6meses" | "ano_anterior" | "personalizado";

interface ContractRow {
  client_id: string;
  client_nome: string;
  numero_orcamento: string;
  valor_avista: number;
  tenant_id: string;
  loja_nome: string;
  codigo_loja: string;
  created_at: string;
}

interface Props {
  tenants: { id: string; nome_loja: string; codigo_loja: string | null; ativo: boolean }[];
}

export function AdminContractsValueCard({ tenants }: Props) {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("mes_atual");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [totalValue, setTotalValue] = useState(0);

  const getDateRange = (p: DatePreset) => {
    const now = new Date();
    const end = endOfDay(now);
    switch (p) {
      case "mes_atual": return { start: startOfMonth(now), end };
      case "30dias": return { start: startOfDay(subDays(now, 30)), end };
      case "60dias": return { start: startOfDay(subDays(now, 60)), end };
      case "90dias": return { start: startOfDay(subDays(now, 90)), end };
      case "6meses": return { start: startOfDay(subMonths(now, 6)), end };
      case "ano_anterior": {
        const lastYear = subYears(now, 1);
        return { start: startOfYear(lastYear), end: new Date(lastYear.getFullYear(), 11, 31, 23, 59, 59) };
      }
      case "personalizado": return {
        start: customStart ? startOfDay(new Date(customStart)) : startOfMonth(now),
        end: customEnd ? endOfDay(new Date(customEnd)) : end,
      };
      default: return { start: startOfMonth(now), end };
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    setLoading(true);
    const activeTenantIds = tenants.filter(t => t.ativo).map(t => t.id);
    if (activeTenantIds.length === 0) { setLoading(false); return; }

    // Get closed sales
    const { data: closedClients } = await supabase
      .from("clients")
      .select("id, nome, numero_orcamento, tenant_id, created_at")
      .in("tenant_id", activeTenantIds)
      .eq("status", "venda_fechada");

    if (!closedClients || closedClients.length === 0) { setLoading(false); return; }

    const clientIds = closedClients.map(c => c.id);
    const { data: sims } = await supabase
      .from("simulations")
      .select("client_id, valor_tela, desconto1, desconto2, desconto3, created_at")
      .in("client_id", clientIds)
      .order("created_at", { ascending: false });

    const simMap: Record<string, number> = {};
    if (sims) {
      sims.forEach(s => {
        if (!simMap[s.client_id]) {
          const vt = Number(s.valor_tela) || 0;
          const d1 = Number(s.desconto1) || 0;
          const d2 = Number(s.desconto2) || 0;
          const d3 = Number(s.desconto3) || 0;
          const after1 = vt * (1 - d1 / 100);
          const after2 = after1 * (1 - d2 / 100);
          simMap[s.client_id] = after2 * (1 - d3 / 100);
        }
      });
    }

    const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

    const mapped: ContractRow[] = closedClients.map(c => ({
      client_id: c.id,
      client_nome: c.nome,
      numero_orcamento: c.numero_orcamento || "—",
      valor_avista: simMap[c.id] || 0,
      tenant_id: c.tenant_id,
      loja_nome: tenantMap[c.tenant_id]?.nome_loja || "—",
      codigo_loja: tenantMap[c.tenant_id]?.codigo_loja || "—",
      created_at: c.created_at,
    }));

    setContracts(mapped);
    const total = mapped.reduce((sum, c) => sum + c.valor_avista, 0);
    setTotalValue(total);
    setLoading(false);
  };

  const { start, end } = getDateRange(preset);

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const d = new Date(c.created_at);
      return d >= start && d <= end;
    });
  }, [contracts, preset, customStart, customEnd]);

  const filteredTotal = useMemo(() => {
    return filteredContracts.reduce((sum, c) => sum + c.valor_avista, 0);
  }, [filteredContracts]);

  const PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
    { value: "mes_atual", label: "Mês Atual" },
    { value: "30dias", label: "Últimos 30 dias" },
    { value: "60dias", label: "Últimos 60 dias" },
    { value: "90dias", label: "Últimos 90 dias" },
    { value: "6meses", label: "Últimos 6 meses" },
    { value: "ano_anterior", label: "Ano Anterior" },
    { value: "personalizado", label: "Personalizado" },
  ];

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow border-accent/30"
        onClick={() => { loadContracts(); setOpen(true); }}
      >
        <CardContent className="p-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-600 shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground">Contratos Fechados</p>
            <p className="text-base font-bold text-foreground">
              R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Valor Movimentado na Plataforma
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
                <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESET_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {preset === "personalizado" && (
              <>
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-8 text-sm w-40" />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-8 text-sm w-40" />
                </div>
              </>
            )}
            <div className="ml-auto bg-green-50 dark:bg-green-950 rounded-lg px-4 py-2">
              <p className="text-xs text-muted-foreground">Total no período</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-400">
                R$ {filteredTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filteredContracts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum contrato fechado neste período</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Nº Contrato</TableHead>
                  <TableHead className="text-right">Valor (à vista)</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map(c => (
                  <TableRow key={c.client_id}>
                    <TableCell className="font-mono text-xs">{c.codigo_loja}</TableCell>
                    <TableCell className="font-medium text-sm">{c.loja_nome}</TableCell>
                    <TableCell>{c.client_nome}</TableCell>
                    <TableCell className="font-mono text-xs">{c.numero_orcamento}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      R$ {c.valor_avista.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
