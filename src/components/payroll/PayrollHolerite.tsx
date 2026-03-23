import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer, X } from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { getRegimeTaxConfig, type TaxRate } from "./PayrollTaxConfig";
import type { Usuario } from "@/hooks/useUsuarios";
import type { Cargo } from "@/hooks/useCargos";

interface DeductionData {
  faltas: number;
  horas_extras: number;
  adiantamento: number;
  outros_descontos: number;
  descricao_outros: string;
  bonus: number;
  descricao_bonus: string;
}

interface Props {
  usuario: Usuario;
  cargos: Cargo[];
  mesReferencia: string;
  totalComissoes: number;
  deduction: DeductionData | null;
  regimeEfetivo: string | null;
  onClose: () => void;
}

export function PayrollHolerite({ usuario, cargos, mesReferencia, totalComissoes, deduction, regimeEfetivo, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings } = useCompanySettings();
  const taxConfig = getRegimeTaxConfig(settings);

  const cargo = usuario.cargo_id ? cargos.find(c => c.id === usuario.cargo_id) : null;
  const salario = usuario.salario_fixo || (cargo as any)?.salario_base || 0;
  const regime = regimeEfetivo || "Sem regime";

  const taxes: TaxRate[] = taxConfig[regime as keyof typeof taxConfig] || [];
  const activeTaxes = taxes.filter(t => t.ativo && t.aliquota > 0);

  const diasUteis = 22;
  const faltasDias = deduction?.faltas || 0;
  const horasExtras = deduction?.horas_extras || 0;
  const adiantamento = deduction?.adiantamento || 0;
  const outrosDescontos = deduction?.outros_descontos || 0;
  const bonus = deduction?.bonus || 0;

  // Proventos
  const descontoFaltas = (salario / diasUteis) * faltasDias;
  const valorHoraExtra = (salario / (diasUteis * 8)) * 1.5;
  const totalHorasExtras = valorHoraExtra * horasExtras;
  const salarioLiquido = salario - descontoFaltas + totalHorasExtras;

  const proventos = [
    { descricao: "Salário Base", valor: salario },
  ];
  if (totalComissoes > 0) proventos.push({ descricao: "Comissões", valor: totalComissoes });
  if (totalHorasExtras > 0) proventos.push({ descricao: `Horas Extras (${horasExtras}h × 1.5)`, valor: totalHorasExtras });
  if (bonus > 0) proventos.push({ descricao: deduction?.descricao_bonus ? `Bônus: ${deduction.descricao_bonus}` : "Bônus", valor: bonus });

  const totalBruto = proventos.reduce((s, p) => s + p.valor, 0);

  // Descontos
  const descontos: { descricao: string; valor: number }[] = [];
  if (faltasDias > 0) descontos.push({ descricao: `Faltas (${faltasDias} dias)`, valor: descontoFaltas });

  // Impostos sobre bruto
  activeTaxes.forEach(tax => {
    const base = tax.nome.includes("FGTS") ? salario : totalBruto;
    descontos.push({ descricao: `${tax.nome} (${tax.aliquota}%)`, valor: (base * tax.aliquota) / 100 });
  });

  if (adiantamento > 0) descontos.push({ descricao: "Adiantamento", valor: adiantamento });
  if (outrosDescontos > 0) descontos.push({ descricao: deduction?.descricao_outros ? `Outros: ${deduction.descricao_outros}` : "Outros Descontos", valor: outrosDescontos });

  const totalDescontos = descontos.reduce((s, d) => s + d.valor, 0);
  const totalLiquido = totalBruto - totalDescontos;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Holerite - ${usuario.nome_completo}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .header h2 { margin: 0; font-size: 16px; }
        .header p { margin: 2px 0; font-size: 12px; color: #666; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 12px; }
        .info-grid div { padding: 4px 0; }
        .info-grid .label { font-weight: bold; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
        th { background: #f0f0f0; text-align: left; padding: 6px 8px; border: 1px solid #ccc; font-weight: bold; }
        td { padding: 6px 8px; border: 1px solid #ddd; }
        .text-right { text-align: right; }
        .total-row { font-weight: bold; background: #f8f8f8; }
        .liquid { font-size: 14px; font-weight: bold; text-align: center; margin-top: 16px; padding: 12px; background: #e8f5e9; border: 2px solid #4caf50; border-radius: 4px; }
        .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
        .signatures { display: flex; justify-content: space-between; margin-top: 60px; font-size: 12px; }
        .sig-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 4px; }
      </style></head><body>
      <div class="header">
        <h2>${settings.company_name || "Empresa"}</h2>
        <p>CNPJ: ${settings.cnpj_loja || "—"} | ${settings.endereco_loja || ""} ${settings.cidade_loja || ""} - ${settings.uf_loja || ""}</p>
        <p style="font-weight:bold; margin-top:8px;">RECIBO DE PAGAMENTO — ${mesReferencia}</p>
      </div>
      <div class="info-grid">
        <div><span class="label">Funcionário:</span> ${usuario.nome_completo}</div>
        <div><span class="label">Cargo:</span> ${cargo?.nome || "—"}</div>
        <div><span class="label">Regime:</span> ${regime}</div>
        <div><span class="label">Mês Referência:</span> ${mesReferencia}</div>
      </div>
      <h4 style="margin:8px 0 4px;">PROVENTOS</h4>
      <table>
        <thead><tr><th>Descrição</th><th class="text-right">Valor</th></tr></thead>
        <tbody>
          ${proventos.map(p => `<tr><td>${p.descricao}</td><td class="text-right">${formatCurrency(p.valor)}</td></tr>`).join("")}
          <tr class="total-row"><td>TOTAL BRUTO</td><td class="text-right">${formatCurrency(totalBruto)}</td></tr>
        </tbody>
      </table>
      <h4 style="margin:8px 0 4px;">DESCONTOS</h4>
      <table>
        <thead><tr><th>Descrição</th><th class="text-right">Valor</th></tr></thead>
        <tbody>
          ${descontos.length > 0 ? descontos.map(d => `<tr><td>${d.descricao}</td><td class="text-right">- ${formatCurrency(d.valor)}</td></tr>`).join("") : '<tr><td colspan="2" style="text-align:center;color:#999;">Nenhum desconto</td></tr>'}
          <tr class="total-row"><td>TOTAL DESCONTOS</td><td class="text-right">- ${formatCurrency(totalDescontos)}</td></tr>
        </tbody>
      </table>
      <div class="liquid">VALOR LÍQUIDO: ${formatCurrency(totalLiquido)}</div>
      <div class="signatures">
        <div class="sig-line">Empregador</div>
        <div class="sig-line">Funcionário</div>
      </div>
      <div class="footer">Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-foreground">Holerite — {usuario.apelido || usuario.nome_completo}</h3>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardContent className="pt-4 space-y-4" ref={printRef}>
          {/* Info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Empresa:</span> <span className="font-medium text-foreground">{settings.company_name}</span></div>
            <div><span className="text-muted-foreground">Mês:</span> <span className="font-medium text-foreground">{mesReferencia}</span></div>
            <div><span className="text-muted-foreground">Funcionário:</span> <span className="font-medium text-foreground">{usuario.nome_completo}</span></div>
            <div><span className="text-muted-foreground">Cargo:</span> <span className="font-medium text-foreground">{cargo?.nome || "—"}</span></div>
            <div><span className="text-muted-foreground">Regime:</span> <span className="font-medium text-foreground">{regime}</span></div>
          </div>

          <Separator />

          {/* Proventos */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">PROVENTOS</h4>
            <div className="space-y-1">
              {proventos.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{p.descricao}</span>
                  <span className="font-medium text-foreground">{formatCurrency(p.valor)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-sm font-bold">
                <span className="text-foreground">Total Bruto</span>
                <span className="text-foreground">{formatCurrency(totalBruto)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Descontos */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">DESCONTOS</h4>
            <div className="space-y-1">
              {descontos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum desconto</p>
              ) : descontos.map((d, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{d.descricao}</span>
                  <span className="font-medium text-destructive">- {formatCurrency(d.valor)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-sm font-bold">
                <span className="text-foreground">Total Descontos</span>
                <span className="text-destructive">- {formatCurrency(totalDescontos)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Líquido */}
          <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-50/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">VALOR LÍQUIDO A RECEBER</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalLiquido)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
