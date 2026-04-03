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

const LINE_CONTAINER_SELECTOR = "p, li, div, span";
const LABEL_ELEMENT_SELECTOR = "strong, b, label";

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const matchesLabel = (value: string, pattern: string) => {
  const normalized = normalizeText(value);
  return new RegExp(`^(?:${pattern})\\s*[:\\-–]?$`, "iu").test(normalized);
};

const replaceTableValues = (root: ParentNode, rule: NormalizationRule) => {
  root.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll(":scope > td, :scope > th"));
    if (cells.length < 2) return;

    if (matchesLabel(cells[0].textContent || "", rule.labelPattern)) {
      cells[1].textContent = rule.value;
    }
  });
};

const replaceRichLineValues = (root: ParentNode, rule: NormalizationRule) => {
  root.querySelectorAll(LINE_CONTAINER_SELECTOR).forEach((element) => {
    const labelElement = Array.from(element.querySelectorAll(":scope > strong, :scope > b, :scope > label")).find((node) =>
      matchesLabel(node.textContent || "", rule.labelPattern),
    );

    if (!labelElement) return;

    let sibling = labelElement.nextSibling;
    while (sibling) {
      const nextSibling = sibling.nextSibling;
      sibling.parentNode?.removeChild(sibling);
      sibling = nextSibling;
    }

    element.appendChild(element.ownerDocument.createTextNode(` ${rule.value}`));
  });
};

const replacePlainLineValues = (root: ParentNode, rule: NormalizationRule) => {
  root.querySelectorAll(LINE_CONTAINER_SELECTOR).forEach((element) => {
    if (element.querySelector(LABEL_ELEMENT_SELECTOR)) return;

    const text = normalizeText(element.textContent || "");
    const match = text.match(new RegExp(`^((?:${rule.labelPattern}))\\s*([:\\-–])\\s*[\\s\\S]*$`, "iu"));
    if (!match) return;

    element.textContent = `${match[1]}${match[2]} ${rule.value}`;
  });
};

export const normalizeImportedTemplateBindings = (
  html: string,
  bindings: ContractTemplateTextBindings,
) => {
  if (!html.trim() || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  const rules: NormalizationRule[] = [
    {
      labelPattern: "(?:nome\\s+completo|nome\\s+do\\s+(?:cliente|contratante|comprador)|cliente|contratante|comprador)",
      value: bindings.nomeCliente,
    },
    { labelPattern: "(?:cpf\\/cnpj|cpf|cnpj)", value: bindings.cpfCliente },
    { labelPattern: "(?:rg|inscri(?:ç|c)(?:a|ã)o\\s+estadual)", value: bindings.rgInscricaoEstadual },
    { labelPattern: "(?:telefone|celular|fone)", value: bindings.telefoneCliente },
    { labelPattern: "(?:e-?mail)", value: bindings.emailCliente },
    { labelPattern: "(?:n(?:º|o|°)?\\s*(?:do\\s*)?orçamento|orçamento\\s*n(?:º|o|°)?)", value: bindings.numeroOrcamento },
    { labelPattern: "(?:n(?:º|o|°)?\\s*(?:do\\s*)?contrato|contrato\\s*n(?:º|o|°)?)", value: bindings.numeroContrato },
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

  rules.forEach((rule) => {
    replaceTableValues(root, rule);
    replaceRichLineValues(root, rule);
    replacePlainLineValues(root, rule);
  });

  return root.innerHTML;
};

export type { ContractTemplateTextBindings };