import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const FORMA_LABELS: Record<string, string> = {
  "A vista": "À Vista",
  Pix: "Pix",
  Credito: "Cartão de Crédito",
  Boleto: "Boleto",
  "Credito / Boleto": "Crédito + Boleto",
  "Entrada e Entrega": "Entrada e Entrega",
};

interface SimulationPdfData {
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
  valorTela: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  valorComDesconto: number;
  formaPagamento: string;
  parcelas: number;
  valorEntrada: number;
  plusPercentual: number;
  taxaCredito: number;
  saldo: number;
  valorFinal: number;
  valorParcela: number;
  date?: string;
  ambientes?: Array<{ environmentName: string; pieceCount: number; totalValue: number }>;
  catalogProducts?: Array<{ name: string; internal_code: string; quantity: number; sale_price: number }>;
}

function buildHtml(data: SimulationPdfData): string {
  const descontoTotal = data.valorTela - data.valorComDesconto;
  const dateStr = data.date
    ? format(new Date(data.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(data.formaPagamento);
  const companyName = data.companyName || "INOVAMAD";
  const companySub = data.companySubtitle || "Gestão & Financiamento";
  const logoHtml = data.companyLogoUrl
    ? `<img src="${data.companyLogoUrl}" alt="Logo" style="height:48px;width:auto;object-fit:contain;margin-right:12px;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Simulação - ${data.clientName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #0891b2; }
  .header-left { display: flex; align-items: center; }
  .logo { font-size: 24px; font-weight: 700; color: #0891b2; letter-spacing: -0.5px; }
  .logo-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .date { font-size: 12px; color: #64748b; text-align: right; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 13px; font-weight: 600; color: #0891b2; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
  .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .field { font-size: 13px; }
  .field-label { color: #64748b; font-size: 11px; }
  .field-value { font-weight: 500; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 16px; text-align: left; font-size: 13px; }
  th { background: #f1f5f9; color: #475569; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  td { border-bottom: 1px solid #f1f5f9; }
  .value-col { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #94a3b8; }
  .highlight-row { background: #f0fdfa; }
  .highlight-row td { font-weight: 700; color: #0891b2; font-size: 15px; border-bottom: none; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  .discount-detail { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  @media print {
    body { padding: 20px; }
    @page { margin: 15mm; size: A4; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div>
        <div class="logo">${companyName}</div>
        <div class="logo-sub">${companySub}</div>
      </div>
    </div>
    <div class="date">
      Simulação gerada em<br/><strong>${dateStr}</strong>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dados do Cliente</div>
    <div class="client-grid">
      <div class="field"><div class="field-label">Nome</div><div class="field-value">${data.clientName}</div></div>
      ${data.clientCpf ? `<div class="field"><div class="field-label">CPF</div><div class="field-value">${data.clientCpf}</div></div>` : ""}
      ${data.clientPhone ? `<div class="field"><div class="field-label">Telefone</div><div class="field-value">${data.clientPhone}</div></div>` : ""}
      ${data.clientEmail ? `<div class="field"><div class="field-label">Email</div><div class="field-value">${data.clientEmail}</div></div>` : ""}
      ${data.vendedor ? `<div class="field"><div class="field-label">Projetista</div><div class="field-value">${data.vendedor}</div></div>` : ""}
      ${data.indicadorNome ? `<div class="field"><div class="field-label">Indicador</div><div class="field-value">${data.indicadorNome} (${data.indicadorComissao || 0}%)</div></div>` : ""}
      ${data.indicadorTelefone ? `<div class="field"><div class="field-label">Tel. Indicador</div><div class="field-value">${data.indicadorTelefone}</div></div>` : ""}
      ${data.indicadorEmail ? `<div class="field"><div class="field-label">Email Indicador</div><div class="field-value">${data.indicadorEmail}</div></div>` : ""}
    </div>
  </div>

  ${data.ambientes && data.ambientes.length > 0 ? `
  <div class="section">
    <div class="section-title">Composição — Ambientes Planejados</div>
    <table>
      <thead><tr><th>Ambiente</th><th class="value-col">Peças</th><th class="value-col">Valor</th></tr></thead>
      <tbody>
        ${data.ambientes.map(a => `<tr><td>${a.environmentName}</td><td class="value-col">${a.pieceCount}</td><td class="value-col">${formatCurrency(a.totalValue)}</td></tr>`).join("")}
        <tr style="font-weight:600;border-top:2px solid #e2e8f0;"><td>Subtotal Planejados</td><td></td><td class="value-col">${formatCurrency(data.ambientes.reduce((s, a) => s + a.totalValue, 0))}</td></tr>
      </tbody>
    </table>
  </div>` : ""}

  ${data.catalogProducts && data.catalogProducts.length > 0 ? `
  <div class="section">
    <div class="section-title">Composição — Produtos do Catálogo</div>
    <table>
      <thead><tr><th>Código</th><th>Produto</th><th class="value-col">Qtd</th><th class="value-col">Valor Unit.</th><th class="value-col">Total</th></tr></thead>
      <tbody>
        ${data.catalogProducts.map(p => `<tr><td style="font-family:monospace;font-size:11px;">${p.internal_code}</td><td>${p.name}</td><td class="value-col">${p.quantity}</td><td class="value-col">${formatCurrency(p.sale_price)}</td><td class="value-col">${formatCurrency(p.sale_price * p.quantity)}</td></tr>`).join("")}
        <tr style="font-weight:600;border-top:2px solid #e2e8f0;"><td colspan="4" style="text-align:right;">Subtotal Catálogo</td><td class="value-col">${formatCurrency(data.catalogProducts.reduce((s, p) => s + p.sale_price * p.quantity, 0))}</td></tr>
      </tbody>
    </table>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Resumo da Simulação</div>
    <table>
      <thead><tr><th>Descrição</th><th class="value-col">Valor</th></tr></thead>
      <tbody>
        <tr><td>Valor de Tela</td><td class="value-col">${formatCurrency(data.valorTela)}</td></tr>
        <tr><td class="muted">Desconto Total<div class="discount-detail">${data.desconto1}% + ${data.desconto2}% + ${data.desconto3}% (cascata)</div></td><td class="value-col muted">- ${formatCurrency(descontoTotal)}</td></tr>
        <tr><td>Valor com Desconto</td><td class="value-col">${formatCurrency(data.valorComDesconto)}</td></tr>
        <tr><td>Forma de Pagamento</td><td class="value-col">${FORMA_LABELS[data.formaPagamento] || data.formaPagamento}</td></tr>
        ${data.valorEntrada > 0 ? `<tr><td>Entrada</td><td class="value-col">${formatCurrency(data.valorEntrada)}</td></tr>` : ""}
        ${data.valorEntrada > 0 ? `<tr><td>Saldo</td><td class="value-col">${formatCurrency(data.saldo)}</td></tr>` : ""}
        ${data.taxaCredito > 0 ? `<tr><td class="muted">Taxa de Crédito</td><td class="value-col muted">${(data.taxaCredito * 100).toFixed(2)}%</td></tr>` : ""}
        ${data.plusPercentual > 0 ? `<tr><td class="muted">Plus</td><td class="value-col muted">${data.plusPercentual.toFixed(2)}%</td></tr>` : ""}
        <tr class="highlight-row"><td>Valor Final</td><td class="value-col">${formatCurrency(data.valorFinal)}</td></tr>
        ${showParcelas ? `<tr class="highlight-row"><td>Parcela (${data.parcelas}x)</td><td class="value-col">${formatCurrency(data.valorParcela)}</td></tr>` : ""}
      </tbody>
    </table>
  </div>

  <div class="footer">
    ${companyName} — Documento gerado automaticamente. Este é um resumo de simulação e não constitui contrato.
  </div>
</body>
</html>`;
}

export function generateSimulationPdf(data: SimulationPdfData) {
  const html = buildHtml(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("Permita pop-ups para gerar o PDF."); return; }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => { setTimeout(() => { printWindow.print(); }, 300); };
}

export type { SimulationPdfData };
