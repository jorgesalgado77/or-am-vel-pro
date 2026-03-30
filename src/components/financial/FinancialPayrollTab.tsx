import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/financing";
import { DollarSign, TrendingUp, Users } from "lucide-react";
import type { useFinancialData } from "@/hooks/useFinancialData";

type FinData = ReturnType<typeof useFinancialData>;

interface Props {
  payrollFixed: FinData["payrollFixed"];
  commissions: FinData["commissions"];
  totalSalarios: number;
  totalComissoes: number;
  totalFolha: number;
}

export const FinancialPayrollTab = React.memo(function FinancialPayrollTab({
  payrollFixed, commissions, totalSalarios, totalComissoes, totalFolha,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalSalarios)}</p>
              <p className="text-xs text-muted-foreground">Salários Fixos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalComissoes)}</p>
              <p className="text-xs text-muted-foreground">Comissões do Mês</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalFolha)}</p>
              <p className="text-xs text-muted-foreground">Total Folha</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Salários Fixos por Funcionário</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-right">Comissão Mês</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollFixed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhum salário fixo cadastrado. Use Configurações para adicionar.
                  </TableCell>
                </TableRow>
              ) : payrollFixed.map(pf => {
                const comm = commissions.find(c => c.usuario_id === pf.usuario_id);
                const commVal = comm?.total_comissao || 0;
                return (
                  <TableRow key={pf.id}>
                    <TableCell className="font-medium">{pf.usuario_nome}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{pf.type}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(pf.salary)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{formatCurrency(commVal)}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatCurrency(pf.salary + commVal)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
});
