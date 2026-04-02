/**
 * Contract generation service — builds HTML from template + replacements.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/financing";
import { FORMAS_PAGAMENTO_LABELS } from "@/services/financialService";

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
}

export function buildContractHtml(templateHtml: string, data: ContractData): string {
  const { formData, client, valorTela, result, formaPagamento, parcelas, valorEntrada, settings, selectedIndicador, comissaoPercentual, items, itemDetails, catalogProducts } = data;

  const dataAtual = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

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
    "{{prazo_entrega}}": formData.prazo_entrega || "",
    "{{observacoes}}": formData.observacoes || "",
    "{{projetista}}": formData.responsavel_venda || client.vendedor || "",
    "{{valor_tela}}": formatCurrency(valorTela),
    "{{valor_final}}": formatCurrency(result.valorFinal),
    "{{forma_pagamento}}": FORMAS_PAGAMENTO_LABELS[formaPagamento] || formaPagamento,
    "{{parcelas}}": String(formData.qtd_parcelas || parcelas),
    "{{valor_parcela}}": formatCurrency(formData.valor_parcelas || result.valorParcela),
    "{{valor_entrada}}": formatCurrency(formData.valor_entrada || valorEntrada),
    "{{data_atual}}": dataAtual,
    "{{empresa_nome}}": settings.company_name || "INOVAMAD",
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
    "{{total_ambientes}}": formatCurrency(items.reduce((a: number, b: any) => a + b.valor_ambiente, 0)),
  };

  let html = templateHtml;
  Object.entries(replacements).forEach(([key, val]) => {
    html = html.split(key).join(val);
  });

  return html;
}
