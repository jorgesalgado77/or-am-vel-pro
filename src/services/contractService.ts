/**
 * Contract generation service — builds HTML from template + replacements.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/financing";
import { FORMAS_PAGAMENTO_LABELS } from "@/services/financialService";
import { normalizeImportedTemplateBindings } from "@/services/contractTemplateNormalizer";

/** Convert masked currency string (e.g. "R$ 5.000,00") or number to a numeric value */
function toNumber(val: string | number | undefined | null): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const cleaned = val.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Convert a number to Brazilian Portuguese words (simplified) */
function numberToWords(value: number): string {
  if (value === 0) return "zero reais";
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const parts: string[] = [];
  const intPart = Math.floor(Math.abs(value));
  const centsPart = Math.round((Math.abs(value) - intPart) * 100);

  function groupToWords(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    const words: string[] = [];
    if (h > 0) words.push(hundreds[h]);
    if (t === 1) { words.push(teens[u]); }
    else { if (t > 1) words.push(tens[t]); if (u > 0) words.push(units[u]); }
    return words.join(" e ");
  }

  if (intPart > 0) {
    const millions = Math.floor(intPart / 1000000);
    const thousands = Math.floor((intPart % 1000000) / 1000);
    const remainder = intPart % 1000;
    if (millions > 0) parts.push(`${groupToWords(millions)} ${millions === 1 ? "milhão" : "milhões"}`);
    if (thousands > 0) parts.push(`${groupToWords(thousands)} mil`);
    if (remainder > 0) parts.push(groupToWords(remainder));
    parts.push(intPart === 1 ? "real" : "reais");
  }

  if (centsPart > 0) {
    if (intPart > 0) parts.push("e");
    parts.push(`${groupToWords(centsPart)} ${centsPart === 1 ? "centavo" : "centavos"}`);
  }

  return parts.join(" ");
}

interface ContractData {
  formData: any;
  client: { nome: string; cpf?: string | null; telefone1?: string | null; email?: string | null; numero_orcamento?: string | null; vendedor?: string | null };
  valorTela: number;
  result: { valorFinal: number; valorParcela: number; valorComDesconto: number };
  formaPagamento: string;
  parcelas: number;
  valorEntrada: number;
  settings: any;
  selectedIndicador?: { nome: string } | null;
  comissaoPercentual: number;
  items: any[];
  itemDetails: any[];
  catalogProducts?: Array<{ name: string; internal_code: string; quantity: number; sale_price: number }>;
  companyPhones?: Array<{ setor: string; responsavel: string; telefone: string }>;
}

export function buildContractHtml(templateHtml: string, data: ContractData): string {
  const { formData, client, valorTela, result, formaPagamento, parcelas, valorEntrada, settings, selectedIndicador, comissaoPercentual, items, itemDetails, catalogProducts, companyPhones } = data;

  const dataAtual = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Computed financial values
  const entradaNum = toNumber(formData.valor_entrada) || valorEntrada;
  const parcelasNum = formData.qtd_parcelas || parcelas;
  const parcelaVal = toNumber(formData.valor_parcelas) || result.valorParcela;
  const totalAmbientes = items.reduce((a: number, b: any) => a + b.valor_ambiente, 0);
  const totalCatalogo = catalogProducts ? catalogProducts.reduce((s, p) => s + p.sale_price * p.quantity, 0) : 0;
  const valorRestante = result.valorFinal - entradaNum;
  const percentualDesconto = valorTela > 0 ? ((valorTela - result.valorComDesconto) / valorTela) * 100 : 0;
  const valorDesconto = valorTela - result.valorComDesconto;

  // Build payment conditions summary
  const condicoesPagamento = [
    `Valor total: ${formatCurrency(result.valorFinal)}`,
    entradaNum > 0 ? `Entrada: ${formatCurrency(entradaNum)}` : null,
    valorRestante > 0 && parcelasNum > 0 ? `${parcelasNum}x de ${formatCurrency(parcelaVal)}` : null,
    `Forma: ${FORMAS_PAGAMENTO_LABELS[formaPagamento] || formaPagamento}`,
    percentualDesconto > 0.5 ? `Desconto: ${percentualDesconto.toFixed(1)}% (${formatCurrency(valorDesconto)})` : null,
  ].filter(Boolean).join(" | ");

  // Value in words (Brazilian Portuguese)
  const valorPorExtenso = numberToWords(result.valorFinal);

  // Build items HTML table
  let itensHtml = "";
  if (items.length > 0) {
    itensHtml = `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
      <tr style="background:#f0f0f0;"><th>Item</th><th>Qtd</th><th>Descrição/Ambiente</th><th>Fornecedor</th><th>Prazo</th><th>Valor</th></tr>
      ${items.map((it: any, i: number) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${it.quantidade}</td><td>${it.descricao_ambiente}</td><td>${it.fornecedor}</td><td>${it.prazo}</td><td style="text-align:right">${formatCurrency(it.valor_ambiente)}</td></tr>`).join("")}
      <tr style="font-weight:bold;"><td colspan="5" style="text-align:right">Total:</td><td style="text-align:right">${formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0))}</td></tr>
    </table>`;
  }

  // Build item details HTML
  let detalhesHtml = "";
  if (itemDetails.length > 0) {
    detalhesHtml = `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">
      <tr style="background:#f0f0f0;"><th>Item</th><th>Títulos</th><th>Corpo</th><th>Porta</th><th>Puxador</th><th>Complemento</th><th>Modelo</th></tr>
      ${itemDetails.map((d: any) => `<tr><td style="text-align:center">${d.item_num}</td><td>${d.titulos}</td><td>${d.corpo}</td><td>${d.porta}</td><td>${d.puxador}</td><td>${d.complemento}</td><td>${d.modelo}</td></tr>`).join("")}
    </table>`;
  }

  const replacements: Record<string, string> = {
    "{{nome_cliente}}": formData.nome_completo || client.nome || "",
    "{{cpf_cliente}}": formData.cpf_cnpj || client.cpf || "",
    "{{rg_insc_estadual}}": formData.rg_insc_estadual || "",
    "{{telefone_cliente}}": formData.telefone || client.telefone1 || "",
    "{{email_cliente}}": formData.email || client.email || "",
    "{{numero_orcamento}}": client.numero_orcamento || "",
    "{{numero_contrato}}": formData.numero_contrato || "",
    "{{data_fechamento}}": formData.data_fechamento ? format(new Date(formData.data_fechamento + "T12:00:00"), "dd/MM/yyyy") : "",
    "{{responsavel_venda}}": formData.responsavel_venda || "",
    "{{data_nascimento}}": formData.data_nascimento ? format(new Date(formData.data_nascimento + "T12:00:00"), "dd/MM/yyyy") : "",
    "{{profissao}}": formData.profissao || "",
    "{{endereco}}": formData.endereco || "",
    "{{bairro}}": formData.bairro || "",
    "{{cidade}}": formData.cidade || "",
    "{{uf}}": formData.uf || "",
    "{{cep}}": formData.cep || "",
    "{{endereco_entrega}}": formData.endereco_entrega || "",
    "{{bairro_entrega}}": formData.bairro_entrega || "",
    "{{cidade_entrega}}": formData.cidade_entrega || "",
    "{{uf_entrega}}": formData.uf_entrega || "",
    "{{cep_entrega}}": formData.cep_entrega || "",
    "{{complemento_entrega}}": formData.complemento_entrega || "",
    "{{prazo_entrega}}": formData.prazo_entrega || "",
    "{{observacoes}}": formData.observacoes || "",
    "{{projetista}}": formData.responsavel_venda || client.vendedor || "",
    "{{valor_tela}}": formatCurrency(valorTela),
    "{{valor_final}}": formatCurrency(result.valorFinal),
    "{{forma_pagamento}}": FORMAS_PAGAMENTO_LABELS[formaPagamento] || formaPagamento,
    "{{parcelas}}": String(formData.qtd_parcelas || parcelas),
    "{{valor_parcela}}": formatCurrency(toNumber(formData.valor_parcelas) || result.valorParcela),
    "{{valor_entrada}}": formatCurrency(toNumber(formData.valor_entrada) || valorEntrada),
    "{{data_atual}}": dataAtual,
    "{{empresa_nome}}": settings.company_name || "INOVAMAD",
    "{{empresa_subtitulo}}": settings.company_subtitle || "",
    "{{logo_empresa}}": settings.logo_url ? `<img src="${settings.logo_url}" alt="Logo" style="max-height:60px;max-width:160px;object-fit:contain;" />` : "",
    "{{logo_empresa_url}}": settings.logo_url || "",
    "{{cnpj_loja}}": settings.cnpj_loja || "",
    "{{endereco_loja}}": settings.endereco_loja || "",
    "{{bairro_loja}}": settings.bairro_loja || "",
    "{{cidade_loja}}": settings.cidade_loja || "",
    "{{uf_loja}}": settings.uf_loja || "",
    "{{cep_loja}}": settings.cep_loja || "",
    "{{telefone_loja}}": settings.telefone_loja || "",
    "{{email_loja}}": settings.email_loja || "",
    "{{indicador_nome}}": selectedIndicador?.nome || "",
    "{{indicador_comissao}}": String(comissaoPercentual),
    "{{itens_tabela}}": itensHtml,
    "{{itens_detalhes}}": detalhesHtml,
    "{{prazo_entrega_fornecedor}}": items.length > 0
      ? [...new Set(items.map((it: any) => it.prazo).filter(Boolean))].join(", ")
      : formData.prazo_entrega || "",
    "{{total_ambientes}}": formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0)),
    "{{ambientes_prazos}}": items.length > 0
      ? `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">
          <tr style="background:#f0f0f0;"><th>Ambiente</th><th>Fornecedor</th><th>Prazo de Entrega</th><th>Valor</th></tr>
          ${items.map((it: any, i: number) => {
            const detail = itemDetails[i];
            return `<tr><td>${it.descricao_ambiente || `Ambiente ${i + 1}`}</td><td>${it.fornecedor || "—"}</td><td>${it.prazo || "—"}</td><td style="text-align:right">${formatCurrency(it.valor_ambiente || 0)}</td></tr>`;
          }).join("")}
          <tr style="font-weight:bold;"><td colspan="3" style="text-align:right">Total:</td><td style="text-align:right">${formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0))}</td></tr>
        </table>`
      : "",
    "{{ambientes_prazos_lista}}": items.length > 0
      ? `<ul style="font-size:12px;margin:8px 0;">${items.map((it: any, i: number) => `<li><strong>${it.descricao_ambiente || `Ambiente ${i + 1}`}</strong> — Fornecedor: ${it.fornecedor || "—"} — Prazo: ${it.prazo || "—"} — ${formatCurrency(it.valor_ambiente || 0)}</li>`).join("")}</ul>`
      : "",
    "{{ambientes_detalhes_completos}}": items.length > 0
      ? `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">
          <tr style="background:#f0f0f0;"><th>Ambiente</th><th>Fornecedor</th><th>Corpo</th><th>Porta</th><th>Puxador</th><th>Complemento</th><th>Modelo</th><th>Prazo</th><th>Valor</th></tr>
          ${items.map((it: any, i: number) => {
            const d = itemDetails[i] || {};
            return `<tr><td>${it.descricao_ambiente || `Ambiente ${i + 1}`}</td><td>${it.fornecedor || "—"}</td><td>${d.corpo || "—"}</td><td>${d.porta || "—"}</td><td>${d.puxador || "—"}</td><td>${d.complemento || "—"}</td><td>${d.modelo || "—"}</td><td>${it.prazo || "—"}</td><td style="text-align:right">${formatCurrency(it.valor_ambiente || 0)}</td></tr>`;
          }).join("")}
          <tr style="font-weight:bold;"><td colspan="8" style="text-align:right">Total:</td><td style="text-align:right">${formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0))}</td></tr>
        </table>`
      : "",
    "{{quantidade_ambientes}}": String(items.length),

    // ── Smart auto-adaptive tables ──
    "{{ambientes_valores_tabela}}": items.length > 0
      ? `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#0891b2;color:#fff;"><th>Ambiente</th><th>Peças</th><th>Valor</th></tr>
          ${items.map((it: any, i: number) => {
            const d = itemDetails[i] || {};
            return `<tr><td>${it.descricao_ambiente || `Ambiente ${i + 1}`}</td><td>${d.titulos || it.quantidade || "—"}</td><td style="text-align:right">${formatCurrency(it.valor_ambiente || 0)}</td></tr>`;
          }).join("")}
          <tr style="font-weight:bold;background:#f0fdfa;"><td colspan="2" style="text-align:right">Total:</td><td style="text-align:right">${formatCurrency(totalAmbientes)}</td></tr>
        </table>`
      : "",

    "{{ambientes_cores_tabela}}": items.length > 0
      ? `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#0891b2;color:#fff;"><th>Ambiente</th><th>Cor Caixa</th><th>Cor Portas</th><th>Ferragens</th><th>Observações</th></tr>
          ${items.map((it: any, i: number) => {
            const d = itemDetails[i] || {};
            return `<tr><td>${it.descricao_ambiente || `Ambiente ${i + 1}`}</td><td>${d.corpo || "—"}</td><td>${d.porta || "—"}</td><td>${d.puxador || "—"}</td><td>${d.complemento || "—"}</td></tr>`;
          }).join("")}
        </table>`
      : "",

    "{{produtos_catalogo_completo}}": catalogProducts && catalogProducts.length > 0
      ? `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#0891b2;color:#fff;"><th>Código</th><th>Qtd</th><th>Produto</th><th>Descrição</th><th>Valor Venda</th><th>Prazo Entrega</th><th>Observações</th></tr>
          ${catalogProducts.map(p => `<tr><td style="font-family:monospace;">${p.internal_code}</td><td style="text-align:center;">${p.quantity}</td><td>${p.name}</td><td>${(p as any).description || "—"}</td><td style="text-align:right;">${formatCurrency(p.sale_price)}</td><td>${(p as any).delivery_time || "—"}</td><td>${(p as any).observations || "—"}</td></tr>`).join("")}
          <tr style="font-weight:bold;background:#f0fdfa;"><td colspan="4" style="text-align:right;">Subtotal:</td><td style="text-align:right;">${formatCurrency(totalCatalogo)}</td><td colspan="2"></td></tr>
        </table>`
      : "",

    "{{endereco_entrega_completo}}": [
      formData.endereco_entrega,
      formData.bairro_entrega,
      formData.cidade_entrega && formData.uf_entrega ? `${formData.cidade_entrega} - ${formData.uf_entrega}` : formData.cidade_entrega || formData.uf_entrega,
      formData.cep_entrega ? `CEP: ${formData.cep_entrega}` : "",
    ].filter(Boolean).join(", ") || "—",

    "{{produtos_catalogo}}": catalogProducts && catalogProducts.length > 0
      ? `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">
          <tr style="background:#f0f0f0;"><th>Código</th><th>Produto</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th></tr>
          ${catalogProducts.map(p => `<tr><td style="font-family:monospace;">${p.internal_code}</td><td>${p.name}</td><td style="text-align:center;">${p.quantity}</td><td style="text-align:right;">${formatCurrency(p.sale_price)}</td><td style="text-align:right;">${formatCurrency(p.sale_price * p.quantity)}</td></tr>`).join("")}
          <tr style="font-weight:bold;"><td colspan="4" style="text-align:right;">Subtotal Catálogo:</td><td style="text-align:right;">${formatCurrency(catalogProducts.reduce((s, p) => s + p.sale_price * p.quantity, 0))}</td></tr>
        </table>`
      : "",
    // New financial & guarantee variables
    "{{valor_com_desconto}}": formatCurrency(result.valorComDesconto),
    "{{percentual_desconto}}": percentualDesconto > 0.01 ? `${percentualDesconto.toFixed(1)}%` : "0%",
    "{{valor_desconto}}": formatCurrency(valorDesconto > 0 ? valorDesconto : 0),
    "{{valor_restante}}": formatCurrency(valorRestante > 0 ? valorRestante : 0),
    "{{condicoes_pagamento}}": condicoesPagamento,
    "{{garantia}}": formData.garantia || settings.garantia_padrao || "Conforme termos do fabricante",
    "{{prazo_garantia}}": formData.prazo_garantia || settings.prazo_garantia_padrao || "12 meses",
    "{{validade_proposta}}": formData.validade_proposta || settings.validade_proposta_padrao || "15 dias",
    "{{data_entrega_prevista}}": formData.data_entrega_prevista
      ? format(new Date(formData.data_entrega_prevista + "T12:00:00"), "dd/MM/yyyy")
      : "",
    "{{valor_total_produtos}}": formatCurrency(totalCatalogo),
    "{{valor_total_ambientes}}": formatCurrency(totalAmbientes),
    "{{valor_por_extenso}}": valorPorExtenso,
  };

  // Dynamic per-environment variables: {{prazo_entrega_ambiente_1}}, {{nome_ambiente_1}}, etc.
  items.forEach((it: any, i: number) => {
    const n = i + 1;
    const d = itemDetails[i] || {};
    replacements[`{{prazo_entrega_ambiente_${n}}}`] = it.prazo || "";
    replacements[`{{nome_ambiente_${n}}}`] = it.descricao_ambiente || "";
    replacements[`{{fornecedor_ambiente_${n}}}`] = it.fornecedor || "";
    replacements[`{{valor_ambiente_${n}}}`] = formatCurrency(it.valor_ambiente || 0);
    replacements[`{{quantidade_ambiente_${n}}}`] = String(it.quantidade || 1);
    replacements[`{{descricao_ambiente_${n}}}`] = it.descricao_ambiente || "";
    // Also include detail fields per environment (merged from itemDetails)
    replacements[`{{titulos_ambiente_${n}}}`] = d.titulos || it.descricao_ambiente || "";
    replacements[`{{corpo_ambiente_${n}}}`] = d.corpo || "";
    replacements[`{{porta_ambiente_${n}}}`] = d.porta || "";
    replacements[`{{puxador_ambiente_${n}}}`] = d.puxador || "";
    replacements[`{{complemento_ambiente_${n}}}`] = d.complemento || "";
    replacements[`{{modelo_ambiente_${n}}}`] = d.modelo || "";
  });
  // Legacy: Also add detail fields per environment (for templates using item_num)
  itemDetails.forEach((d: any) => {
    const n = d.item_num;
    if (!replacements[`{{corpo_ambiente_${n}}}`]) replacements[`{{corpo_ambiente_${n}}}`] = d.corpo || "";
    if (!replacements[`{{porta_ambiente_${n}}}`]) replacements[`{{porta_ambiente_${n}}}`] = d.porta || "";
    if (!replacements[`{{puxador_ambiente_${n}}}`]) replacements[`{{puxador_ambiente_${n}}}`] = d.puxador || "";
    if (!replacements[`{{complemento_ambiente_${n}}}`]) replacements[`{{complemento_ambiente_${n}}}`] = d.complemento || "";
    if (!replacements[`{{modelo_ambiente_${n}}}`]) replacements[`{{modelo_ambiente_${n}}}`] = d.modelo || "";
  });

  // Dynamic per-catalog-product variables: {{produto_catalogo_nome_1}}, etc.
  if (catalogProducts) {
    catalogProducts.forEach((p, i) => {
      const n = i + 1;
      replacements[`{{produto_catalogo_nome_${n}}}`] = p.name;
      replacements[`{{produto_catalogo_codigo_${n}}}`] = p.internal_code;
      replacements[`{{produto_catalogo_qtd_${n}}}`] = String(p.quantity);
      replacements[`{{produto_catalogo_valor_${n}}}`] = formatCurrency(p.sale_price);
      replacements[`{{produto_catalogo_subtotal_${n}}}`] = formatCurrency(p.sale_price * p.quantity);
    });
    replacements["{{quantidade_produtos_catalogo}}"] = String(catalogProducts.length);
  }

  // Dynamic company phone variables
  const phones = companyPhones || [];
  if (phones.length > 0) {
    replacements["{{telefones_uteis}}"] = `<table border="1" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:10px;">
      <tr style="background:#0891b2;color:#fff;"><th>Setor</th><th>Responsável</th><th>Telefone</th></tr>
      ${phones.map(p => `<tr><td>${p.setor || "—"}</td><td>${p.responsavel || "—"}</td><td>${p.telefone || "—"}</td></tr>`).join("")}
    </table>`;
    phones.forEach((p, i) => {
      const n = i + 1;
      replacements[`{{telefone_util_setor_${n}}}`] = p.setor || "";
      replacements[`{{telefone_util_responsavel_${n}}}`] = p.responsavel || "";
      replacements[`{{telefone_util_numero_${n}}}`] = p.telefone || "";
    });
  } else {
    replacements["{{telefones_uteis}}"] = "";
  }

  let html = templateHtml;
  Object.entries(replacements).forEach(([key, val]) => {
    html = html.split(key).join(val);
  });

  html = normalizeImportedTemplateBindings(html, {
    nomeCliente: replacements["{{nome_cliente}}"],
    cpfCliente: replacements["{{cpf_cliente}}"],
    rgInscricaoEstadual: replacements["{{rg_insc_estadual}}"],
    telefoneCliente: replacements["{{telefone_cliente}}"],
    emailCliente: replacements["{{email_cliente}}"],
    numeroOrcamento: replacements["{{numero_orcamento}}"],
    numeroContrato: replacements["{{numero_contrato}}"],
    dataFechamento: replacements["{{data_fechamento}}"],
    responsavelVenda: replacements["{{responsavel_venda}}"],
    dataNascimento: replacements["{{data_nascimento}}"],
    profissao: replacements["{{profissao}}"],
    endereco: replacements["{{endereco}}"],
    bairro: replacements["{{bairro}}"],
    cidade: replacements["{{cidade}}"],
    uf: replacements["{{uf}}"],
    cep: replacements["{{cep}}"],
    prazoEntrega: replacements["{{prazo_entrega}}"],
    formaPagamento: replacements["{{forma_pagamento}}"],
    valorTela: replacements["{{valor_tela}}"],
    valorFinal: replacements["{{valor_final}}"],
    valorEntrada: replacements["{{valor_entrada}}"],
    valorParcela: replacements["{{valor_parcela}}"],
    parcelasResumo: `${replacements["{{parcelas}}"]}x de ${replacements["{{valor_parcela}}"]}`,
    garantia: replacements["{{garantia}}"],
    prazoGarantia: replacements["{{prazo_garantia}}"],
    validadeProposta: replacements["{{validade_proposta}}"],
    condicoesPagamento: replacements["{{condicoes_pagamento}}"],
  });

  return html;
}
