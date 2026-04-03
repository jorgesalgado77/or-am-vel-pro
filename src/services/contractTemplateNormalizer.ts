interface ContractTemplateTextBindings {
  nomeCliente: string;
  cpfCliente: string;
  rgInscricaoEstadual: string;
  telefoneCliente: string;
  emailCliente: string;
  numeroOrcamento: string;
  numeroContrato: string;
  dataFechamento: string;
  responsavelVenda: string;
  dataNascimento: string;
  profissao: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  prazoEntrega: string;
  formaPagamento: string;
  valorTela: string;
  valorFinal: string;
  valorEntrada: string;
  valorParcela: string;
  parcelasResumo: string;
  garantia: string;
  prazoGarantia: string;
  validadeProposta: string;
  condicoesPagamento: string;
}

type NormalizationRule = {
  labelPattern: string;
  value: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const replaceInlineLabelValue = (html: string, labelPattern: string, value: string) => {
  const safeValue = escapeHtml(value);
  const plainLabelRegex = new RegExp(
    `((?:${labelPattern})\\s*[:\\-–]\\s*)([^<\\n]*)`,
    "giu",
  );
  const richLabelRegex = new RegExp(
    `(<(?:strong|b|span|label)[^>]*>\\s*(?:${labelPattern})\\s*[:\\-–]?\\s*<\\/(?:strong|b|span|label)>\\s*)([^<\\n]*)`,
    "giu",
  );

  return html
    .replace(plainLabelRegex, (_, prefix: string) => `${prefix}${safeValue}`)
    .replace(richLabelRegex, (_, prefix: string) => `${prefix}${safeValue}`);
};

const replaceTableLabelValue = (html: string, labelPattern: string, value: string) => {
  const safeValue = escapeHtml(value);
  const rowRegex = new RegExp(
    `(<t[dh][^>]*>\\s*(?:${labelPattern})\\s*<\\/t[dh]>\\s*<t[dh][^>]*>)([\\s\\S]*?)(<\\/t[dh]>)`,
    "giu",
  );

  return html.replace(rowRegex, `$1${safeValue}$3`);
};

export const normalizeImportedTemplateBindings = (
  html: string,
  bindings: ContractTemplateTextBindings,
) => {
  const rules: NormalizationRule[] = [
    {
      labelPattern: "(?:nome\\s+completo|nome\\s+do\\s+(?:cliente|contratante|comprador)|cliente|contratante|comprador)",
      value: bindings.nomeCliente,
    },
    { labelPattern: "(?:cpf\\/cnpj|cpf|cnpj)", value: bindings.cpfCliente },
    { labelPattern: "(?:rg|inscri(?:ç|c)(?:a|ã)o\\s+estadual)", value: bindings.rgInscricaoEstadual },
    { labelPattern: "(?:telefone|celular|fone)", value: bindings.telefoneCliente },
    { labelPattern: "(?:e-?mail)", value: bindings.emailCliente },
    { labelPattern: "(?:n(?:º|o|°)?\\s*do\\s*orçamento|orçamento)", value: bindings.numeroOrcamento },
    { labelPattern: "(?:n(?:º|o|°)?\\s*do\\s*contrato|contrato)", value: bindings.numeroContrato },
    { labelPattern: "(?:data\\s+de\\s+fechamento|data\\s+do\\s+contrato|data\\s+da\\s+venda)", value: bindings.dataFechamento },
    { labelPattern: "(?:respons[aá]vel\\s+(?:pela\\s+)?venda|vendedor(?:a)?)", value: bindings.responsavelVenda },
    { labelPattern: "(?:data\\s+de\\s+nascimento)", value: bindings.dataNascimento },
    { labelPattern: "(?:profiss[aã]o|ocupaç[aã]o)", value: bindings.profissao },
    { labelPattern: "(?:endere[cç]o)", value: bindings.endereco },
    { labelPattern: "(?:bairro)", value: bindings.bairro },
    { labelPattern: "(?:cidade|munic[ií]pio)", value: bindings.cidade },
    { labelPattern: "(?:uf|estado)", value: bindings.uf },
    { labelPattern: "(?:cep)", value: bindings.cep },
    { labelPattern: "(?:prazo\\s+de\\s+entrega)", value: bindings.prazoEntrega },
    { labelPattern: "(?:forma\\s+de\\s+pagamento)", value: bindings.formaPagamento },
    { labelPattern: "(?:valor\\s+de\\s+tela)", value: bindings.valorTela },
    { labelPattern: "(?:valor\\s+final|valor\\s+total|total\\s+do\\s+contrato)", value: bindings.valorFinal },
    { labelPattern: "(?:entrada|sinal)", value: bindings.valorEntrada },
    { labelPattern: "(?:valor\\s+da\\s+parcela|parcela)", value: bindings.valorParcela },
    { labelPattern: "(?:parcelas?|n[uú]mero\\s+de\\s+parcelas)", value: bindings.parcelasResumo },
    { labelPattern: "(?:garantia)", value: bindings.garantia },
    { labelPattern: "(?:prazo\\s+de\\s+garantia)", value: bindings.prazoGarantia },
    { labelPattern: "(?:validade\\s+da\\s+proposta|proposta\\s+v[aá]lida\\s+at[eé])", value: bindings.validadeProposta },
    { labelPattern: "(?:condiç(?:õ|o)es\\s+de\\s+pagamento)", value: bindings.condicoesPagamento },
  ];

  return rules.reduce((normalizedHtml, rule) => {
    const inlineNormalized = replaceInlineLabelValue(normalizedHtml, rule.labelPattern, rule.value);
    return replaceTableLabelValue(inlineNormalized, rule.labelPattern, rule.value);
  }, html);
};

export type { ContractTemplateTextBindings };