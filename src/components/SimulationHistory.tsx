import {useState, useEffect, useMemo} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {ArrowLeft, Trash2, GitCompareArrows, FileDown} from "lucide-react";
import {generateSimulationPdf} from "@/lib/generatePdf";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {formatCurrency} from "@/lib/financing";
import {format} from "date-fns";
import {ptBR} from "date-fns/locale";
import {useIndicadores} from "@/hooks/useIndicadores";
import {useCompanySettings} from "@/hooks/useCompanySettings";
import type {Database} from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Simulation = Database["public"]["Tables"]["simulations"]["Row"];

interface SimulationHistoryProps {
  client: Client;
  onBack: () => void;
  onLoadSimulation?: (simulation: Simulation, client: Client) => void;
}

const FORMA_LABELS: Record<string, string> = {
  "A vista": "À Vista",
  Pix: "Pix",
  Credito: "Cartão de Crédito",
  Boleto: "Boleto",
  "Credito / Boleto": "Crédito + Boleto",
  "Entrada e Entrega": "Entrada e Entrega",
};

export function SimulationHistory({ client, onBack, onLoadSimulation }: SimulationHistoryProps) {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const { indicadores } = useIndicadores();
  const { settings } = useCompanySettings();

  const indicador = useMemo(() => {
    if (!client.indicador_id) return null;
    return indicadores.find(i => i.id === client.indicador_id) || null;
  }, [client.indicador_id, indicadores]);

  const fetchSimulations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("simulations")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar simulações");
    } else {
      setSimulations(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSimulations();
  }, [client.id]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta simulação?")) return;
    const { error } = await supabase.from("simulations").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir simulação");
    } else {
      toast.success("Simulação excluída");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetchSimulations();
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else toast.info("Selecione no máximo 4 simulações para comparar");
      return next;
    });
  };

  const selectedSimulations = simulations.filter((s) => selected.has(s.id));

  const descontoTotal = (s: Simulation) => {
    const after1 = Number(s.valor_tela) * (1 - (Number(s.desconto1) || 0) / 100);
    const after2 = after1 * (1 - (Number(s.desconto2) || 0) / 100);
    const after3 = after2 * (1 - (Number(s.desconto3) || 0) / 100);
    return Number(s.valor_tela) - after3;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h3 className="text-sm text-muted-foreground">Histórico de simulações</h3>
            <p className="text-base font-semibold text-foreground">{client.nome}</p>
          </div>
        </div>
        {selected.size >= 2 && (
          <Button
            onClick={() => setComparing(!comparing)}
            variant={comparing ? "default" : "outline"}
            className="gap-2"
          >
            <GitCompareArrows className="h-4 w-4" />
            {comparing ? "Fechar Comparação" : `Comparar (${selected.size})`}
          </Button>
        )}
      </div>

      {/* Comparison Panel */}
      {comparing && selectedSimulations.length >= 2 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-primary" />
              Comparação de Cenários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-medium min-w-[160px]">Campo</TableHead>
                    {selectedSimulations.map((s, i) => (
                      <TableHead key={s.id} className="font-medium text-center min-w-[140px]">
                        <Badge variant="outline" className="text-xs">
                          Cenário {i + 1}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(s.created_at), "dd/MM/yy HH:mm")}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <CompareRow label="Valor de Tela" values={selectedSimulations.map((s) => formatCurrency(Number(s.valor_tela)))} />
                  <CompareRow
                    label="Descontos"
                    values={selectedSimulations.map(
                      (s) => `${s.desconto1 || 0}% + ${s.desconto2 || 0}% + ${s.desconto3 || 0}%`
                    )}
                  />
                  <CompareRow label="Desconto Total" values={selectedSimulations.map((s) => formatCurrency(descontoTotal(s)))} muted />
                  <CompareRow label="Forma Pagamento" values={selectedSimulations.map((s) => FORMA_LABELS[s.forma_pagamento] || s.forma_pagamento)} />
                  <CompareRow label="Parcelas" values={selectedSimulations.map((s) => `${s.parcelas || 1}x`)} />
                  <CompareRow label="Entrada" values={selectedSimulations.map((s) => formatCurrency(Number(s.valor_entrada) || 0))} />
                  <CompareRow
                    label="Valor Final"
                    values={selectedSimulations.map((s) => formatCurrency(Number(s.valor_final) || 0))}
                    highlight
                    bestIndex={findBestIndex(selectedSimulations.map((s) => Number(s.valor_final) || 0), "min")}
                  />
                  <CompareRow
                    label="Valor Parcela"
                    values={selectedSimulations.map((s) => formatCurrency(Number(s.valor_parcela) || 0))}
                    highlight
                    bestIndex={findBestIndex(selectedSimulations.map((s) => Number(s.valor_parcela) || 0), "min")}
                  />
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulations List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {simulations.length} {simulations.length === 1 ? "simulação" : "simulações"} salvas
            </CardTitle>
            {simulations.length > 1 && (
              <p className="text-xs text-muted-foreground">Selecione até 4 para comparar</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : simulations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma simulação salva para este cliente</p>
          ) : (
            <div className="space-y-3">
              {simulations.map((sim) => (
                <SimulationCard
                  key={sim.id}
                  simulation={sim}
                  clientName={client.nome}
                  clientCpf={client.cpf || undefined}
                  clientEmail={client.email || undefined}
                  clientPhone={client.telefone1 || undefined}
                  vendedor={client.vendedor || undefined}
                  indicadorNome={indicador?.nome}
                  indicadorComissao={indicador?.comissao_percentual}
                  indicadorTelefone={indicador?.telefone || undefined}
                  indicadorEmail={indicador?.email || undefined}
                  companyName={settings.company_name}
                  companySubtitle={settings.company_subtitle || undefined}
                  companyLogoUrl={settings.logo_url || undefined}
                  isSelected={selected.has(sim.id)}
                  onToggle={() => toggleSelect(sim.id)}
                  onDelete={() => handleDelete(sim.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SimulationCard({
  simulation,
  clientName,
  clientCpf,
  clientEmail,
  clientPhone,
  vendedor,
  indicadorNome,
  indicadorComissao,
  indicadorTelefone,
  indicadorEmail,
  companyName,
  companySubtitle,
  companyLogoUrl,
  isSelected,
  onToggle,
  onDelete,
}: {
  simulation: Simulation;
  clientName: string;
  clientCpf?: string;
  clientEmail?: string;
  clientPhone?: string;
  vendedor?: string;
  indicadorNome?: string;
  indicadorComissao?: number;
  indicadorTelefone?: string;
  indicadorEmail?: string;
  companyName?: string;
  companySubtitle?: string;
  companyLogoUrl?: string;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const s = simulation;

  const descontoTotalCalc = () => {
    const after1 = Number(s.valor_tela) * (1 - (Number(s.desconto1) || 0) / 100);
    const after2 = after1 * (1 - (Number(s.desconto2) || 0) / 100);
    return after2 * (1 - (Number(s.desconto3) || 0) / 100);
  };

  const handlePdf = () => {
    generateSimulationPdf({
      clientName,
      clientCpf,
      clientEmail,
      clientPhone,
      vendedor,
      indicadorNome,
      indicadorComissao,
      indicadorTelefone,
      indicadorEmail,
      companyName,
      companySubtitle,
      companyLogoUrl,
      valorTela: Number(s.valor_tela),
      desconto1: Number(s.desconto1) || 0,
      desconto2: Number(s.desconto2) || 0,
      desconto3: Number(s.desconto3) || 0,
      valorComDesconto: descontoTotalCalc(),
      formaPagamento: s.forma_pagamento,
      parcelas: s.parcelas || 1,
      valorEntrada: Number(s.valor_entrada) || 0,
      plusPercentual: Number(s.plus_percentual) || 0,
      taxaCredito: 0,
      saldo: descontoTotalCalc() - (Number(s.valor_entrada) || 0),
      valorFinal: Number(s.valor_final) || 0,
      valorParcela: Number(s.valor_parcela) || 0,
      date: s.created_at,
    });
  };
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/30"
      }`}
    >
      <Checkbox checked={isSelected} onCheckedChange={onToggle} />
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Valor de Tela</p>
          <p className="font-medium text-foreground tabular-nums">{formatCurrency(Number(s.valor_tela))}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Pagamento</p>
          <p className="font-medium text-foreground">{FORMA_LABELS[s.forma_pagamento] || s.forma_pagamento}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Valor Final</p>
          <p className="font-semibold text-primary tabular-nums">{formatCurrency(Number(s.valor_final) || 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Data</p>
          <p className="font-medium text-foreground">
            {format(new Date(s.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={handlePdf} title="Gerar PDF">
          <FileDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} title="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  values,
  muted,
  highlight,
  bestIndex,
}: {
  label: string;
  values: string[];
  muted?: boolean;
  highlight?: boolean;
  bestIndex?: number;
}) {
  return (
    <TableRow>
      <TableCell className={muted ? "text-muted-foreground text-sm" : "text-sm font-medium text-foreground"}>
        {label}
      </TableCell>
      {values.map((v, i) => (
        <TableCell
          key={i}
          className={`text-center tabular-nums text-sm ${
            highlight && bestIndex === i
              ? "font-bold text-success"
              : highlight
              ? "font-semibold text-foreground"
              : muted
              ? "text-muted-foreground"
              : "text-foreground"
          }`}
        >
          {v}
          {highlight && bestIndex === i && (
            <Badge className="ml-1 text-[10px] bg-success/10 text-success border-success/30" variant="outline">
              Melhor
            </Badge>
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

function findBestIndex(values: number[], mode: "min" | "max"): number {
  if (values.length === 0) return -1;
  const positiveValues = values.filter((v) => v > 0);
  if (positiveValues.length === 0) return -1;
  let best = mode === "min" ? Infinity : -Infinity;
  let bestIdx = 0;
  values.forEach((v, i) => {
    if (v <= 0) return;
    if (mode === "min" ? v < best : v > best) {
      best = v;
      bestIdx = i;
    }
  });
  return bestIdx;
}
