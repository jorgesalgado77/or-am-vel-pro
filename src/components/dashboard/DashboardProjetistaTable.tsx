import { useState, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { calcularComissao } from "@/hooks/useComissaoPolicy";
import type { CargoPermissoes } from "@/hooks/useCargos";

interface ProjetistaData {
  count: number;
  total: number;
  expired: number;
  closed: number;
  closedTotal: number;
}

interface DashboardProjetistaTableProps {
  byProjetista: [string, ProjetistaData][];
  cargos: CargoPermissoes[];
  comissaoPolicy: ReturnType<typeof import("@/hooks/useComissaoPolicy").useComissaoPolicy>["policy"];
}

export const DashboardProjetistaTable = memo(function DashboardProjetistaTable({
  byProjetista, cargos, comissaoPolicy,
}: DashboardProjetistaTableProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"nome" | "clientes" | "valor" | "conversao">("nome");

  const filtered = useMemo(() =>
    byProjetista
      .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sort === "clientes") return b[1].count - a[1].count;
        if (sort === "valor") return b[1].total - a[1].total;
        if (sort === "conversao") {
          const convA = a[1].count > 0 ? a[1].closed / a[1].count : 0;
          const convB = b[1].count > 0 ? b[1].closed / b[1].count : 0;
          return convB - convA;
        }
        return a[0].localeCompare(b[0]);
      }),
    [byProjetista, search, sort]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-base">Detalhes por Projetista</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-[140px] pl-7 text-xs" />
            </div>
            <Select value={sort} onValueChange={(v: typeof sort) => setSort(v)}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nome">Nome</SelectItem>
                <SelectItem value="clientes">Clientes</SelectItem>
                <SelectItem value="valor">Valor</SelectItem>
                <SelectItem value="conversao">Conversão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {byProjetista.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado no período</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado para &quot;{search}&quot;</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="font-medium">Projetista</TableHead>
                <TableHead className="font-medium text-center">Clientes</TableHead>
                <TableHead className="font-medium text-center">Fechados</TableHead>
                <TableHead className="font-medium text-center">Conversão</TableHead>
                <TableHead className="font-medium text-right">Em Negociação</TableHead>
                <TableHead className="font-medium text-right">Contratos</TableHead>
                <TableHead className="font-medium text-right">Valor Total</TableHead>
                <TableHead className="font-medium text-right">Comissão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(([name, data]) => {
                const conv = data.count > 0 ? ((data.closed / data.count) * 100).toFixed(0) : "0";
                const openTotal = data.total - data.closedTotal;
                const matchedCargo = cargos.find(c =>
                  name.toLowerCase().includes(c.nome.toLowerCase()) || c.nome.toLowerCase() === "projetista"
                );
                const comPercent = matchedCargo ? matchedCargo.comissao_percentual : 0;
                const comResult = calcularComissao(data.closedTotal, comPercent, comissaoPolicy, matchedCargo?.id || null, matchedCargo?.nome || null);
                const comissaoValor = (data.closedTotal * comResult.percentual) / 100;
                return (
                  <TableRow key={name}>
                    <TableCell className="font-medium text-foreground">{name}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{data.count}</Badge></TableCell>
                    <TableCell className="text-center"><Badge variant="default" className="bg-emerald-600">{data.closed}</Badge></TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={Number(conv) >= 30 ? "border-emerald-500 text-emerald-600" : ""}>{conv}%</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-amber-600">{openTotal > 0 ? formatCurrency(openTotal) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-600">{data.closedTotal > 0 ? formatCurrency(data.closedTotal) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-primary">
                      {comissaoValor > 0 ? formatCurrency(comissaoValor) : "—"}
                      {comResult.percentual > 0 && <span className="text-xs text-muted-foreground ml-1">({comResult.percentual}%)</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(() => {
                const totClientes = filtered.reduce((s, [, d]) => s + d.count, 0);
                const totFechados = filtered.reduce((s, [, d]) => s + d.closed, 0);
                const totValor = filtered.reduce((s, [, d]) => s + d.total, 0);
                const totOpen = filtered.reduce((s, [, d]) => s + (d.total - d.closedTotal), 0);
                const totClosed = filtered.reduce((s, [, d]) => s + d.closedTotal, 0);
                const totComissao = filtered.reduce((s, [name, data]) => {
                  const mc = cargos.find(c => name.toLowerCase().includes(c.nome.toLowerCase()) || c.nome.toLowerCase() === "projetista");
                  const cp = mc ? mc.comissao_percentual : 0;
                  const cr = calcularComissao(data.closedTotal, cp, comissaoPolicy, mc?.id || null, mc?.nome || null);
                  return s + (data.closedTotal * cr.percentual) / 100;
                }, 0);
                const totConv = totClientes > 0 ? ((totFechados / totClientes) * 100).toFixed(0) : "0";
                return (
                  <TableRow className="bg-muted/50 border-t-2 border-border font-semibold">
                    <TableCell className="text-foreground">Total</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{totClientes}</Badge></TableCell>
                    <TableCell className="text-center"><Badge variant="default" className="bg-emerald-600">{totFechados}</Badge></TableCell>
                    <TableCell className="text-center"><Badge variant="outline">{totConv}%</Badge></TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{totOpen > 0 ? formatCurrency(totOpen) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{totClosed > 0 ? formatCurrency(totClosed) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totValor)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{totComissao > 0 ? formatCurrency(totComissao) : "—"}</TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
});
