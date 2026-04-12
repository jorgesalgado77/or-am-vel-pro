import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/financing";
import { DollarSign, TrendingUp, Users } from "lucide-react";
import { KpiCard } from "@/components/dashboard/DashboardKpiCard";
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
        <KpiCard icon={Users} label="Salários Fixos" value={formatCurrency(totalSalarios)} colorVariant="blue" tooltip="Soma de todos os salários fixos dos colaboradores" />
        <KpiCard icon={TrendingUp} label="Comissões do Mês" value={formatCurrency(totalComissoes)} colorVariant="violet" tooltip="Total de comissões geradas no mês atual" />
        <KpiCard icon={DollarSign} label="Total Folha" value={formatCurrency(totalFolha)} colorVariant="teal" tooltip="Soma de salários fixos e comissões" />
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
