import { useState, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { formatCurrency } from "@/lib/financing";

interface IndicadorData {
  nome: string;
  comissao: number;
  count: number;
  total: number;
  comissaoTotal: number;
  clientes: { nome: string; orcamento: string }[];
}

interface DashboardIndicadorTableProps {
  byIndicador: [string, IndicadorData][];
}

export const DashboardIndicadorTable = memo(function DashboardIndicadorTable({ byIndicador }: DashboardIndicadorTableProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"nome" | "clientes" | "valor" | "comissao">("nome");

  const filtered = useMemo(() =>
    byIndicador
      .filter(([, data]) => data.nome.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sort === "clientes") return b[1].count - a[1].count;
        if (sort === "valor") return b[1].total - a[1].total;
        if (sort === "comissao") return b[1].comissaoTotal - a[1].comissaoTotal;
        return a[1].nome.localeCompare(b[1].nome);
      }),
    [byIndicador, search, sort]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-base">Detalhes por Indicador</CardTitle>
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
                <SelectItem value="comissao">Comissão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {byIndicador.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum indicador vinculado no período</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado para &quot;{search}&quot;</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="font-medium">Indicador</TableHead>
                <TableHead className="font-medium">Cliente / Orçamento</TableHead>
                <TableHead className="font-medium text-center">Contratos</TableHead>
                <TableHead className="font-medium text-right">Valor Contrato</TableHead>
                <TableHead className="font-medium text-right">Comissão Devida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(([id, data]) => (
                <TableRow key={id}>
                  <TableCell className="font-medium text-foreground">
                    {data.nome} <span className="text-muted-foreground text-xs">({data.comissao}%)</span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {data.clientes.map((cl, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium text-foreground">{cl.nome}</span>
                          <span className="text-muted-foreground ml-1">({cl.orcamento})</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><Badge variant="default" className="bg-emerald-600">{data.count}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-emerald-600">{formatCurrency(data.total)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-primary">{formatCurrency(data.comissaoTotal)}</TableCell>
                </TableRow>
              ))}
              {(() => {
                const totClientes = filtered.reduce((s, [, d]) => s + d.count, 0);
                const totValor = filtered.reduce((s, [, d]) => s + d.total, 0);
                const totComissao = filtered.reduce((s, [, d]) => s + d.comissaoTotal, 0);
                return (
                  <TableRow className="bg-muted/50 border-t-2 border-border font-semibold">
                    <TableCell className="text-foreground">Total</TableCell>
                    <TableCell />
                    <TableCell className="text-center"><Badge variant="default" className="bg-emerald-600">{totClientes}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{formatCurrency(totValor)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{formatCurrency(totComissao)}</TableCell>
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
