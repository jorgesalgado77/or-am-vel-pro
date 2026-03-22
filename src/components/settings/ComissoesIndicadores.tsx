import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, CheckCircle2, Ban, PauseCircle, Printer, Search, Filter } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { useIndicadores } from "@/hooks/useIndicadores";
import { formatCurrency } from "@/lib/financing";

interface ComissaoRow {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  cpf_cnpj: string | null;
  quantidade_ambientes: number;
  valor_contrato: number;
  data_fechamento: string | null;
  indicador_id: string | null;
  indicador_nome: string | null;
  comissao_percentual: number;
  comissao_valor: number;
  comissao_status: string;
  comissao_data_pagamento: string | null;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  paga: { label: "Paga", variant: "default" },
  retida: { label: "Retida", variant: "secondary" },
  recusada: { label: "Recusada", variant: "destructive" },
};

function printListview(title: string, rows: ComissaoRow[]) {
  const html = `
    <html><head><title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
      h2 { margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: bold; }
      .right { text-align: right; }
      .center { text-align: center; }
      .total { font-weight: bold; background: #f0f0f0; }
      @media print { button { display: none; } }
    </style></head><body>
    <h2>${title}</h2>
    <p>Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
    <table>
      <thead><tr>
        <th>Indicador</th><th>Nº Contrato</th><th>Data Fechamento</th>
        <th>Cliente</th><th>CPF/CNPJ</th><th class="center">Amb.</th>
        <th class="right">Valor Contrato</th><th class="right">Comissão</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.indicador_nome || "—"}</td>
          <td>${r.numero_contrato}</td>
          <td>${r.data_fechamento ? format(new Date(r.data_fechamento), "dd/MM/yyyy") : "—"}</td>
          <td>${r.nome_cliente}</td>
          <td>${r.cpf_cnpj || "—"}</td>
          <td class="center">${r.quantidade_ambientes}</td>
          <td class="right">${formatCurrency(r.valor_contrato)}</td>
          <td class="right">${formatCurrency(r.comissao_valor)}</td>
          <td>${STATUS_BADGE[r.comissao_status]?.label || r.comissao_status}</td>
        </tr>`).join("")}
        <tr class="total">
          <td colspan="6">Total (${rows.length} registros)</td>
          <td class="right">${formatCurrency(rows.reduce((s, r) => s + Number(r.valor_contrato), 0))}</td>
          <td class="right">${formatCurrency(rows.reduce((s, r) => s + Number(r.comissao_valor), 0))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <br/><button onclick="window.print()">Imprimir / Salvar PDF</button>
    </body></html>`;
  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

export function ComissoesIndicadores() {
  const { indicadores } = useIndicadores();
  const [rows, setRows] = useState<ComissaoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterNome, setFilterNome] = useState("");
  const [filterCpf, setFilterCpf] = useState("");
  const [filterIndicador, setFilterIndicador] = useState("todos");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_tracking")
      .select("*")
      .order("data_fechamento", { ascending: false });
    if (!error && data) setRows(data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const updateData: any = {
      comissao_status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === "paga") {
      updateData.comissao_data_pagamento = new Date().toISOString();
    }
    const { error } = await supabase
      .from("client_tracking")
      .update(updateData)
      .eq("id", id);
    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success(`Comissão marcada como ${STATUS_BADGE[newStatus]?.label || newStatus}`);
      setRows(prev => prev.map(r => r.id === id ? { ...r, comissao_status: newStatus, ...(newStatus === "paga" ? { comissao_data_pagamento: new Date().toISOString() } : {}) } : r));
    }
  };

  // Apply filters
  const filtered = rows.filter(r => {
    if (filterNome && !r.nome_cliente.toLowerCase().includes(filterNome.toLowerCase())) return false;
    if (filterCpf && !(r.cpf_cnpj || "").includes(filterCpf)) return false;
    if (filterIndicador !== "todos" && r.indicador_id !== filterIndicador) return false;
    if (filterDataInicio && r.data_fechamento && new Date(r.data_fechamento) < new Date(filterDataInicio)) return false;
    if (filterDataFim && r.data_fechamento && new Date(r.data_fechamento) > new Date(filterDataFim + "T23:59:59")) return false;
    return true;
  });

  const pendentes = filtered.filter(r => r.comissao_status === "pendente");
  const pagas = filtered.filter(r => r.comissao_status === "paga");
  const retidas = filtered.filter(r => r.comissao_status === "retida");
  const recusadas = filtered.filter(r => r.comissao_status === "recusada");

  const renderTable = (data: ComissaoRow[], title: string, showActions: boolean) => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm">{title} ({data.length})</CardTitle>
          {data.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => printListview(title, data)} className="gap-1 text-xs h-7">
              <Printer className="h-3 w-3" />Relatório
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead>Nº Contrato</TableHead>
                <TableHead>Fechamento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead className="text-center">Amb.</TableHead>
                <TableHead className="text-right">Valor Contrato</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                {showActions && <TableHead className="text-center">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow><TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-6">Nenhum registro</TableCell></TableRow>
              ) : (
                data.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r.indicador_nome || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.numero_contrato}</TableCell>
                    <TableCell className="text-sm">{r.data_fechamento ? format(new Date(r.data_fechamento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm">{r.nome_cliente}</TableCell>
                    <TableCell className="text-sm font-mono">{r.cpf_cnpj || "—"}</TableCell>
                    <TableCell className="text-center text-sm">{r.quantidade_ambientes}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatCurrency(r.valor_contrato)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">{formatCurrency(r.comissao_valor)}</TableCell>
                    {showActions && (
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleStatusChange(r.id, "paga")}
                            title="Marcar como Paga"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                            onClick={() => handleStatusChange(r.id, "retida")}
                            title="Marcar como Retida"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => handleStatusChange(r.id, "recusada")}
                            title="Marcar como Recusada"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
              {data.length > 0 && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={6} className="text-sm">Total ({data.length})</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(data.reduce((s, r) => s + Number(r.valor_contrato), 0))}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(data.reduce((s, r) => s + Number(r.comissao_valor), 0))}</TableCell>
                  {showActions && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Separator />
      <h3 className="text-base font-semibold text-foreground">Comissões de Indicadores</h3>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Filter className="h-4 w-4" />Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Nome do Cliente</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={filterNome} onChange={e => setFilterNome(e.target.value)} placeholder="Buscar..." className="pl-8 h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">CPF/CNPJ</Label>
              <Input value={filterCpf} onChange={e => setFilterCpf(e.target.value)} placeholder="Filtrar..." className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Indicador</Label>
              <Select value={filterIndicador} onValueChange={setFilterIndicador}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {indicadores.map(ind => (
                    <SelectItem key={ind.id} value={ind.id}>{ind.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={filterDataInicio} onChange={e => setFilterDataInicio(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={filterDataFim} onChange={e => setFilterDataFim(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => { setFilterNome(""); setFilterCpf(""); setFilterIndicador("todos"); setFilterDataInicio(""); setFilterDataFim(""); }} className="text-xs h-7">
              Limpar Filtros
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1 text-xs h-7">
              <RefreshCw className="h-3 w-3" />Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main - Pendentes */}
      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : (
        <>
          {renderTable(pendentes, "Comissões Pendentes", true)}
          {renderTable(pagas, "Comissões Pagas", false)}
          {renderTable(retidas, "Comissões Retidas", false)}
          {renderTable(recusadas, "Comissões Recusadas", false)}
        </>
      )}
    </div>
  );
}
