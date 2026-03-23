import {useState, useEffect} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {isCargoTotalLoja} from "@/hooks/useComissaoPolicy";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Printer, DollarSign, Users, Check, X, Pause, Plus} from "lucide-react";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Textarea} from "@/components/ui/textarea";
import {useUsuarios} from "@/hooks/useUsuarios";
import {useCargos} from "@/hooks/useCargos";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {format, startOfMonth, endOfMonth} from "date-fns";

import {formatCurrency} from "@/lib/financing";
import {useComissaoPolicy} from "@/hooks/useComissaoPolicy";

interface PayrollCommission {
  id: string;
  usuario_id: string | null;
  indicador_id: string | null;
  mes_referencia: string;
  valor_comissao: number;
  valor_base: number;
  status: string;
  observacao: string | null;
  cargo_referencia: string | null;
  contrato_numero: string | null;
  client_name: string | null;
  created_at: string;
}

interface PayrollReportProps {
  onBack: () => void;
}

export function PayrollReport({ onBack }: PayrollReportProps) {
  const { usuarios } = useUsuarios();
  const { cargos } = useCargos();
  const { policy } = useComissaoPolicy();
  const [commissions, setCommissions] = useState<PayrollCommission[]>([]);
  const [filterMode, setFilterMode] = useState<"mes" | "periodo">("mes");
  const [mesReferencia, setMesReferencia] = useState(() => format(new Date(), "yyyy-MM"));
  const [dataInicio, setDataInicio] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCommission, setNewCommission] = useState({ usuario_id: "", valor_comissao: "", observacao: "" });

  const activeUsers = usuarios.filter((u) => u.ativo);

  const fetchCommissions = async () => {
    let query = supabase.from("payroll_commissions").select("*");

    if (filterMode === "mes") {
      query = query.eq("mes_referencia", mesReferencia);
    } else {
      query = query.gte("created_at", dataInicio).lte("created_at", dataFim + "T23:59:59");
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar comissões");
    else setCommissions((data as PayrollCommission[]) || []);
  };

  useEffect(() => { fetchCommissions(); }, [filterMode, mesReferencia, dataInicio, dataFim]);

  const getCargoNome = (cargoId: string | null) => {
    if (!cargoId) return "—";
    return cargos.find((c) => c.id === cargoId)?.nome || "—";
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return "—";
    const u = usuarios.find((u) => u.id === userId);
    return u?.apelido || u?.nome_completo || "—";
  };

  const getRegimeEfetivo = (u: typeof activeUsers[0]) => {
    if (u.tipo_regime) return u.tipo_regime;
    const cargo = u.cargo_id ? cargos.find(c => c.id === u.cargo_id) : null;
    const tc = (cargo as any)?.tipo_comissao as string | undefined;
    if (tc?.startsWith("clt")) return "CLT";
    if (tc?.startsWith("mei")) return "MEI";
    return null;
  };

  const regimeGroups = {
    CLT: activeUsers.filter((u) => getRegimeEfetivo(u) === "CLT"),
    MEI: activeUsers.filter((u) => getRegimeEfetivo(u) === "MEI"),
    Freelancer: activeUsers.filter((u) => getRegimeEfetivo(u) === "Freelancer"),
    "Sem regime": activeUsers.filter((u) => !getRegimeEfetivo(u)),
  };

  const totalSalarios = activeUsers.reduce((sum, u) => {
    const cargo = u.cargo_id ? cargos.find(c => c.id === u.cargo_id) : null;
    return sum + (u.salario_fixo || (cargo as any)?.salario_base || 0);
  }, 0);
  const mediaSalario = activeUsers.length > 0 ? totalSalarios / activeUsers.length : 0;

  // Commission summaries
  const comissoesPagas = commissions.filter((c) => c.status === "paga");
  const comissoesRetidas = commissions.filter((c) => c.status === "retida");
  const comissoesCanceladas = commissions.filter((c) => c.status === "cancelada");
  const comissoesPendentes = commissions.filter((c) => c.status === "pendente");

  const totalPagas = comissoesPagas.reduce((s, c) => s + Number(c.valor_comissao), 0);
  const totalRetidas = comissoesRetidas.reduce((s, c) => s + Number(c.valor_comissao), 0);
  const totalCanceladas = comissoesCanceladas.reduce((s, c) => s + Number(c.valor_comissao), 0);
  const totalPendentes = comissoesPendentes.reduce((s, c) => s + Number(c.valor_comissao), 0);
  const totalComissoes = commissions.reduce((s, c) => s + Number(c.valor_comissao), 0);

  const updateCommissionStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("payroll_commissions").update({ status } as any).eq("id", id);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success("Status atualizado!"); fetchCommissions(); }
  };

  const handleAddCommission = async () => {
    if (!newCommission.usuario_id || !newCommission.valor_comissao) {
      toast.error("Preencha usuário e valor"); return;
    }
    const { error } = await supabase.from("payroll_commissions").insert({
      usuario_id: newCommission.usuario_id,
      mes_referencia: mesReferencia,
      valor_comissao: parseFloat(newCommission.valor_comissao.replace(/[^\d.,]/g, "").replace(",", ".")),
      observacao: newCommission.observacao || null,
      status: "pendente",
    } as any);
    if (error) toast.error("Erro ao adicionar");
    else { toast.success("Comissão adicionada!"); setAddDialogOpen(false); setNewCommission({ usuario_id: "", valor_comissao: "", observacao: "" }); fetchCommissions(); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pendente: { label: "Pendente", className: "border-amber-500/50 text-amber-700" },
      paga: { label: "Paga", className: "border-emerald-500/50 text-emerald-700" },
      retida: { label: "Retida", className: "border-blue-500/50 text-blue-700" },
      cancelada: { label: "Cancelada", className: "border-destructive/50 text-destructive" },
    };
    const s = map[status] || map.pendente;
    return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
  };

  const handlePrint = () => window.print();

  return (
    <div className="max-w-6xl mx-auto space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h3 className="text-sm text-muted-foreground">Relatório</h3>
            <p className="text-base font-semibold text-foreground">Folha de Pagamento</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Comissão
          </Button>
          <Button size="sm" className="gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Date Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">Filtrar por</Label>
              <Select value={filterMode} onValueChange={(v) => setFilterMode(v as "mes" | "periodo")}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mês referência</SelectItem>
                  <SelectItem value="periodo">Período</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filterMode === "mes" ? (
              <div>
                <Label className="text-xs">Mês</Label>
                <Input type="month" value={mesReferencia} onChange={(e) => setMesReferencia(e.target.value)} className="w-44" />
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Data início</Label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-44" />
                </div>
                <div>
                  <Label className="text-xs">Data fim</Label>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-44" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Funcionários</p>
                <p className="text-xl font-bold text-foreground">{activeUsers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Salários</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalSalarios)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comissões Pagas</p>
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalPagas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Pause className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comissões Retidas</p>
                <p className="text-lg font-bold text-blue-700">{formatCurrency(totalRetidas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <X className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Canceladas</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(totalCanceladas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employees Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalhamento por Funcionário</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead className="text-right">Salário Fixo</TableHead>
                  <TableHead className="text-right">Comissão (%)</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum funcionário ativo
                    </TableCell>
                  </TableRow>
                )}
                {activeUsers.map((u) => {
                  const cargo = u.cargo_id ? cargos.find(c => c.id === u.cargo_id) : null;
                  const comissaoEfetiva = u.comissao_percentual || cargo?.comissao_percentual || 0;
                  const salarioEfetivo = u.salario_fixo || (cargo as any)?.salario_base || 0;
                  const tipoComissaoCargo = (cargo as any)?.tipo_comissao as string | undefined;
                  const regimeEfetivo = u.tipo_regime || (
                    tipoComissaoCargo?.startsWith("clt") ? "CLT"
                    : tipoComissaoCargo?.startsWith("mei") ? "MEI"
                    : null
                  );
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.apelido || u.nome_completo}</TableCell>
                      <TableCell>{getCargoNome(u.cargo_id)}</TableCell>
                      <TableCell>
                        {regimeEfetivo ? (
                          <Badge variant="outline" className={
                            regimeEfetivo === "CLT" ? "border-emerald-500/50 text-emerald-700"
                              : regimeEfetivo === "MEI" ? "border-blue-500/50 text-blue-700"
                              : "border-amber-500/50 text-amber-700"
                          }>
                            {regimeEfetivo}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{salarioEfetivo > 0 ? formatCurrency(salarioEfetivo) : "—"}</TableCell>
                      <TableCell className="text-right">{comissaoEfetiva > 0 ? `${comissaoEfetiva}%` : "—"}</TableCell>
                      <TableCell className="text-sm">{u.telefone || "—"}</TableCell>
                      <TableCell className="text-sm">{u.email || "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {activeUsers.length > 0 && (
                  <TableRow className="bg-secondary/30 font-semibold">
                    <TableCell colSpan={3} className="text-right">TOTAL</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalSalarios)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Commissions Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Comissões do Período</span>
            <Badge variant="secondary">{commissions.length} registros — Total: {formatCurrency(totalComissoes)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Funcionário / Indicador</TableHead>
                  <TableHead>Cargo/Função</TableHead>
                  <TableHead>Tipo Comissão</TableHead>
                  <TableHead>Base Cálculo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-right">Valor Base</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="print:hidden">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Nenhuma comissão no período
                    </TableCell>
                  </TableRow>
                )}
                {commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.usuario_id ? getUserName(c.usuario_id) : c.observacao?.split(":")[0] || "Indicador"}
                    </TableCell>
                    <TableCell>
                      {c.cargo_referencia ? (
                        <Badge variant="outline" className="text-[10px]">{c.cargo_referencia}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const userRecord = c.usuario_id ? usuarios.find(u => u.id === c.usuario_id) : null;
                        const cargoId = userRecord?.cargo_id || null;
                        const cargo = cargoId ? cargos.find(cg => cg.id === cargoId) : null;
                        const tipoComissao = (cargo as any)?.tipo_comissao;
                        if (tipoComissao === "mei") return <Badge variant="outline" className="text-[10px] border-teal-500/50 text-teal-700">MEI</Badge>;
                        if (tipoComissao === "mei_only") return <Badge variant="outline" className="text-[10px] border-cyan-500/50 text-cyan-700">MEI Comissão</Badge>;
                        if (tipoComissao === "clt") return <Badge variant="outline" className="text-[10px] border-purple-500/50 text-purple-700">CLT</Badge>;
                        if (tipoComissao === "clt_only") return <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-700">CLT Fixo</Badge>;
                        if (tipoComissao === "clt_escalonada") return <Badge variant="outline" className="text-[10px] border-indigo-500/50 text-indigo-700">CLT Escalonada</Badge>;
                        const isEscalonada = policy.tipo === "escalonada" && cargoId && policy.cargos_ids.includes(cargoId);
                        return isEscalonada ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-700">Escalonada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">Fixa</Badge>
                         );
                       })()}
                     </TableCell>
                     <TableCell>
                       {(() => {
                         const userRecord = c.usuario_id ? usuarios.find(u => u.id === c.usuario_id) : null;
                         const cargoNome = userRecord?.cargo_id ? cargos.find(cg => cg.id === userRecord.cargo_id)?.nome : null;
                         const totalLoja = isCargoTotalLoja(cargoNome);
                         return totalLoja ? (
                           <Badge variant="outline" className="text-[10px] border-purple-500/50 text-purple-700">Total Loja</Badge>
                         ) : (
                           <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-700">Por Cliente</Badge>
                         );
                       })()}
                     </TableCell>
                    <TableCell className="text-sm">{c.client_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.contrato_numero || "—"}</TableCell>
                    <TableCell className="text-right text-sm">{c.valor_base ? formatCurrency(Number(c.valor_base)) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(c.valor_comissao))}</TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="print:hidden">
                      <div className="flex gap-1">
                        {c.status !== "paga" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Marcar como Paga" onClick={() => updateCommissionStatus(c.id, "paga")}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {c.status !== "retida" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="Reter" onClick={() => updateCommissionStatus(c.id, "retida")}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {c.status !== "cancelada" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancelar" onClick={() => updateCommissionStatus(c.id, "cancelada")}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Commission summary by status */}
          {commissions.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-sm font-bold text-amber-700">{formatCurrency(totalPendentes)}</p>
                <p className="text-[10px] text-muted-foreground">{comissoesPendentes.length} registros</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Pagas</p>
                <p className="text-sm font-bold text-emerald-700">{formatCurrency(totalPagas)}</p>
                <p className="text-[10px] text-muted-foreground">{comissoesPagas.length} registros</p>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-50/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Retidas</p>
                <p className="text-sm font-bold text-blue-700">{formatCurrency(totalRetidas)}</p>
                <p className="text-[10px] text-muted-foreground">{comissoesRetidas.length} registros</p>
              </div>
              <div className="rounded-lg border border-destructive/30 bg-red-50/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Canceladas</p>
                <p className="text-sm font-bold text-destructive">{formatCurrency(totalCanceladas)}</p>
                <p className="text-[10px] text-muted-foreground">{comissoesCanceladas.length} registros</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakdown by Regime */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(regimeGroups)
          .filter(([, users]) => users.length > 0)
          .map(([regime, users]) => {
            const subtotal = users.reduce((sum, u) => sum + (u.salario_fixo || 0), 0);
            return (
              <Card key={regime}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{regime}</span>
                    <Badge variant="secondary">{users.length} {users.length === 1 ? "pessoa" : "pessoas"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate">{u.apelido || u.nome_completo}</span>
                      <span className="text-muted-foreground font-medium">{u.salario_fixo ? formatCurrency(u.salario_fixo) : "—"}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="text-foreground">Subtotal</span>
                    <span className="text-primary">{formatCurrency(subtotal)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {/* Add Commission Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Funcionário</Label>
              <Select value={newCommission.usuario_id} onValueChange={(v) => setNewCommission((p) => ({ ...p, usuario_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor da Comissão (R$)</Label>
              <Input
                value={newCommission.valor_comissao}
                onChange={(e) => setNewCommission((p) => ({ ...p, valor_comissao: e.target.value }))}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea
                value={newCommission.observacao}
                onChange={(e) => setNewCommission((p) => ({ ...p, observacao: e.target.value }))}
                placeholder="Opcional"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddCommission}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
