import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building2, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import {
  getRegimeTaxConfig,
  getINSSFaixas,
  getIRRFFaixas,
  getIRRFLimites,
  getMEIDASConfig,
  calcularINSS,
  calcularIRRF,
  calcularDASMEI,
  type MEIAtividade,
} from "./PayrollTaxConfig";
import type { Usuario } from "@/hooks/useUsuarios";
import type { Cargo } from "@/hooks/useCargos";
import type { EmployeeDeduction } from "./PayrollDeductions";

interface Props {
  usuarios: Usuario[];
  cargos: Cargo[];
  mesReferencia: string;
  getRegimeEfetivo: (u: Usuario) => string | null;
  getUserCommissions: (userId: string) => number;
  deductionsData: Record<string, EmployeeDeduction>;
}

interface EmployeeCost {
  nome: string;
  regime: string;
  salario: number;
  comissoes: number;
  bruto: number;
  descontos: number;
  liquido: number;
  custoEmpresa: number; // bruto + encargos patronais
}

export function PayrollSummary({ usuarios, cargos, mesReferencia, getRegimeEfetivo, getUserCommissions, deductionsData }: Props) {
  const { settings } = useCompanySettings();
  const taxConfig = getRegimeTaxConfig(settings);
  const inssFaixas = getINSSFaixas(settings);
  const irrfFaixas = getIRRFFaixas(settings);
  const irrfLimites = getIRRFLimites(settings);
  const meiDasConfig = getMEIDASConfig(settings);

  const activeUsers = usuarios.filter(u => u.ativo);

  const calcEmployeeCost = (u: Usuario): EmployeeCost => {
    const cargo = u.cargo_id ? cargos.find(c => c.id === u.cargo_id) : null;
    const salario = u.salario_fixo || (cargo as any)?.salario_base || 0;
    const regime = getRegimeEfetivo(u) || "Sem regime";
    const comissoes = getUserCommissions(u.id);
    const deduction = deductionsData[u.id];

    const diasUteis = 22;
    const faltasDias = deduction?.faltas || 0;
    const horasExtras = deduction?.horas_extras || 0;
    const adiantamento = deduction?.adiantamento || 0;
    const outrosDescontos = deduction?.outros_descontos || 0;
    const bonus = deduction?.bonus || 0;

    const descontoFaltas = (salario / diasUteis) * faltasDias;
    const valorHoraExtra = (salario / (diasUteis * 8)) * 1.5;
    const totalHorasExtras = valorHoraExtra * horasExtras;

    const bruto = salario + comissoes + totalHorasExtras + bonus;

    const taxes = taxConfig[regime as keyof typeof taxConfig] || [];
    const activeTaxes = taxes.filter(t => t.ativo && t.aliquota > 0);

    let totalDescontos = descontoFaltas + adiantamento + outrosDescontos;
    let custoPatronal = 0;

    const isProgressivo = regime === "CLT" || regime === "Freelancer";
    const isMEI = regime === "MEI";

    if (isMEI) {
      const hasICMS = activeTaxes.some(t => t.nome.toUpperCase().includes("ICMS"));
      const hasISS = activeTaxes.some(t => t.nome.toUpperCase().includes("ISS"));
      const atividade: MEIAtividade = (hasICMS && hasISS) ? "ambos" : hasICMS ? "comercio" : "servicos";
      const dasCalc = calcularDASMEI(atividade, meiDasConfig);
      totalDescontos += dasCalc.total;
    } else {
      let descontoINSSCalc = 0;
      if (isProgressivo && inssFaixas.length > 0) {
        descontoINSSCalc = calcularINSS(bruto, inssFaixas).valor;
      }

      activeTaxes.forEach(tax => {
        const nomeUpper = tax.nome.toUpperCase();
        const isINSS = nomeUpper.includes("INSS") && !nomeUpper.includes("PATRONAL");
        const isIRRF = nomeUpper.includes("IRRF");
        const isFGTS = nomeUpper.includes("FGTS");
        const isPatronal = nomeUpper.includes("PATRONAL");

        if (isINSS && isProgressivo && inssFaixas.length > 0) {
          totalDescontos += calcularINSS(bruto, inssFaixas).valor;
        } else if (isIRRF && isProgressivo && irrfFaixas.length > 0) {
          const irrfCalc = calcularIRRF(bruto, descontoINSSCalc, irrfFaixas, irrfLimites.isencao, irrfLimites.transicao);
          totalDescontos += irrfCalc.valor;
        } else if (isFGTS) {
          // FGTS é custo empresa, não desconto do funcionário
          custoPatronal += (salario * tax.aliquota) / 100;
        } else if (isPatronal) {
          custoPatronal += (bruto * tax.aliquota) / 100;
        } else {
          totalDescontos += (bruto * tax.aliquota) / 100;
        }
      });
    }

    const liquido = bruto - totalDescontos;

    return {
      nome: u.apelido || u.nome_completo,
      regime,
      salario,
      comissoes,
      bruto,
      descontos: totalDescontos,
      liquido,
      custoEmpresa: bruto + custoPatronal,
    };
  };

  const employeeCosts = activeUsers.map(calcEmployeeCost);

  const regimes = ["CLT", "MEI", "Freelancer", "Sem regime"] as const;

  const regimeSummaries = regimes.map(regime => {
    const employees = employeeCosts.filter(e => e.regime === regime);
    return {
      regime,
      count: employees.length,
      totalBruto: employees.reduce((s, e) => s + e.bruto, 0),
      totalDescontos: employees.reduce((s, e) => s + e.descontos, 0),
      totalLiquido: employees.reduce((s, e) => s + e.liquido, 0),
      totalCustoEmpresa: employees.reduce((s, e) => s + e.custoEmpresa, 0),
    };
  }).filter(r => r.count > 0);

  const totals = {
    count: employeeCosts.length,
    totalBruto: employeeCosts.reduce((s, e) => s + e.bruto, 0),
    totalDescontos: employeeCosts.reduce((s, e) => s + e.descontos, 0),
    totalLiquido: employeeCosts.reduce((s, e) => s + e.liquido, 0),
    totalCustoEmpresa: employeeCosts.reduce((s, e) => s + e.custoEmpresa, 0),
  };

  const regimeBadgeClass = (regime: string) => {
    if (regime === "CLT") return "border-emerald-500/50 text-emerald-700";
    if (regime === "MEI") return "border-blue-500/50 text-blue-700";
    if (regime === "Freelancer") return "border-amber-500/50 text-amber-700";
    return "border-muted-foreground/50 text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Resumo Geral da Folha — {mesReferencia}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Regime summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {regimeSummaries.map(r => (
            <Card key={r.regime} className="border-2">
              <CardContent className="pt-3 pb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={regimeBadgeClass(r.regime)}>{r.regime}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> {r.count}
                  </span>
                </div>
                <Separator />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Bruto</span>
                    <span className="font-medium text-foreground">{formatCurrency(r.totalBruto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descontos</span>
                    <span className="font-medium text-destructive">- {formatCurrency(r.totalDescontos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Líquido</span>
                    <span className="font-semibold text-foreground">{formatCurrency(r.totalLiquido)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo Empresa</span>
                    <span className="font-bold text-primary">{formatCurrency(r.totalCustoEmpresa)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detailed table */}
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-right">Comissões</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead className="text-right">Custo Empresa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeCosts.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{e.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${regimeBadgeClass(e.regime)}`}>{e.regime}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(e.salario)}</TableCell>
                  <TableCell className="text-right text-sm">{e.comissoes > 0 ? formatCurrency(e.comissoes) : "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(e.bruto)}</TableCell>
                  <TableCell className="text-right text-sm text-destructive">- {formatCurrency(e.descontos)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{formatCurrency(e.liquido)}</TableCell>
                  <TableCell className="text-right text-sm font-bold text-primary">{formatCurrency(e.custoEmpresa)}</TableCell>
                </TableRow>
              ))}
              {employeeCosts.length > 0 && (
                <TableRow className="bg-secondary/30 font-bold">
                  <TableCell colSpan={2}>TOTAL GERAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(employeeCosts.reduce((s, e) => s + e.salario, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(employeeCosts.reduce((s, e) => s + e.comissoes, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.totalBruto)}</TableCell>
                  <TableCell className="text-right text-destructive">- {formatCurrency(totals.totalDescontos)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.totalLiquido)}</TableCell>
                  <TableCell className="text-right text-primary">{formatCurrency(totals.totalCustoEmpresa)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Grand total highlight */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-xs text-muted-foreground">Total Líquido (Pagamento)</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(totals.totalLiquido)}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-destructive/30 bg-destructive/5">
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-xs text-muted-foreground">Total Impostos e Descontos</p>
              <p className="text-xl font-bold text-destructive">{formatCurrency(totals.totalDescontos)}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardContent className="pt-3 pb-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Building2 className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Custo Total Empresa</p>
              </div>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totals.totalCustoEmpresa)}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
