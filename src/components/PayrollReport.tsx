import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer, DollarSign, Users, Briefcase } from "lucide-react";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useCargos } from "@/hooks/useCargos";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface PayrollReportProps {
  onBack: () => void;
}

export function PayrollReport({ onBack }: PayrollReportProps) {
  const { usuarios } = useUsuarios();
  const { cargos } = useCargos();

  const activeUsers = usuarios.filter((u) => u.ativo);

  const getCargoNome = (cargoId: string | null) => {
    if (!cargoId) return "—";
    return cargos.find((c) => c.id === cargoId)?.nome || "—";
  };

  const regimeGroups = {
    CLT: activeUsers.filter((u) => u.tipo_regime === "CLT"),
    MEI: activeUsers.filter((u) => u.tipo_regime === "MEI"),
    Freelancer: activeUsers.filter((u) => u.tipo_regime === "Freelancer"),
    "Sem regime": activeUsers.filter((u) => !u.tipo_regime),
  };

  const totalSalarios = activeUsers.reduce((sum, u) => sum + (u.salario_fixo || 0), 0);
  const totalComissoes = activeUsers.reduce((sum, u) => sum + (u.comissao_percentual || 0), 0);
  const mediaSalario = activeUsers.length > 0 ? totalSalarios / activeUsers.length : 0;

  const handlePrint = () => {
    window.print();
  };

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
        <Button size="sm" className="gap-2" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Funcionários Ativos</p>
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
                <p className="text-xs text-muted-foreground">Total Salários</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(totalSalarios)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Média Salarial</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(mediaSalario)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Regimes</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {Object.entries(regimeGroups).map(([regime, users]) =>
                    users.length > 0 ? (
                      <Badge key={regime} variant="secondary" className="text-[10px]">
                        {regime}: {users.length}
                      </Badge>
                    ) : null
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Table */}
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
                {activeUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome_completo}</TableCell>
                    <TableCell>{getCargoNome(u.cargo_id)}</TableCell>
                    <TableCell>
                      {u.tipo_regime ? (
                        <Badge
                          variant="outline"
                          className={
                            u.tipo_regime === "CLT"
                              ? "border-emerald-500/50 text-emerald-700"
                              : u.tipo_regime === "MEI"
                              ? "border-blue-500/50 text-blue-700"
                              : "border-amber-500/50 text-amber-700"
                          }
                        >
                          {u.tipo_regime}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {u.salario_fixo ? formatCurrency(u.salario_fixo) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{u.comissao_percentual ? `${u.comissao_percentual}%` : "—"}</TableCell>
                    <TableCell className="text-sm">{u.telefone || "—"}</TableCell>
                    <TableCell className="text-sm">{u.email || "—"}</TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                {activeUsers.length > 0 && (
                  <TableRow className="bg-secondary/30 font-semibold">
                    <TableCell colSpan={3} className="text-right">
                      TOTAL
                    </TableCell>
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
    </div>
  );
}
