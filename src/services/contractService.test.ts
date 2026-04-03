import { describe, it, expect } from "vitest";
import { buildContractHtml } from "./contractService";

const template = `
<p>Cliente: {{nome_cliente}}</p>
<p>Valor Final: {{valor_final}}</p>
<p>Prazo Amb 1: {{prazo_entrega_ambiente_1}}</p>
<p>Prazo Amb 2: {{prazo_entrega_ambiente_2}}</p>
<p>Nome Amb 1: {{nome_ambiente_1}}</p>
<p>Corpo Amb 1: {{corpo_ambiente_1}}</p>
<p>Porta Amb 2: {{porta_ambiente_2}}</p>
<p>Fornecedor geral: {{prazo_entrega_fornecedor}}</p>
<div>{{ambientes_prazos}}</div>
<div>{{ambientes_prazos_lista}}</div>
<div>{{ambientes_detalhes_completos}}</div>
`;

const items = [
  { quantidade: 1, descricao_ambiente: "Cozinha", fornecedor: "Forn A", prazo: "30 dias úteis", valor_ambiente: 5000 },
  { quantidade: 2, descricao_ambiente: "Quarto", fornecedor: "Forn B", prazo: "45 dias úteis", valor_ambiente: 3000 },
];

const itemDetails = [
  { item_num: 1, titulos: "T1", corpo: "MDF Branco", porta: "Laca Cinza", puxador: "Perfil", complemento: "Vidro", modelo: "Modelo X" },
  { item_num: 2, titulos: "T2", corpo: "MDP Carvalho", porta: "Laca Preta", puxador: "Cava", complemento: "Espelho", modelo: "Modelo Y" },
];

const data = {
  formData: { nome_completo: "João Silva", cpf_cnpj: "123.456.789-00", numero_contrato: "CT-999" },
  client: { nome: "João Silva", cpf: "123.456.789-00", telefone1: null, email: null, numero_orcamento: "ORC-001", vendedor: "Carlos" },
  valorTela: 10000,
  result: { valorFinal: 8000, valorParcela: 800, valorComDesconto: 7500 },
  formaPagamento: "cartao",
  parcelas: 10,
  valorEntrada: 1000,
  settings: { company_name: "Teste LTDA" },
  selectedIndicador: null,
  comissaoPercentual: 5,
  items,
  itemDetails,
  catalogProducts: [],
};

describe("buildContractHtml", () => {
  it("replaces per-environment variables correctly", () => {
    const html = buildContractHtml(template, data);

    expect(html).toContain("Cliente: João Silva");
    expect(html).toContain("Prazo Amb 1: 30 dias úteis");
    expect(html).toContain("Prazo Amb 2: 45 dias úteis");
    expect(html).toContain("Nome Amb 1: Cozinha");
    expect(html).toContain("Corpo Amb 1: MDF Branco");
    expect(html).toContain("Porta Amb 2: Laca Preta");
  });

  it("generates {{ambientes_prazos}} table with all environments", () => {
    const html = buildContractHtml(template, data);

    expect(html).toContain("Cozinha");
    expect(html).toContain("Quarto");
    expect(html).toContain("Forn A");
    expect(html).toContain("Forn B");
    expect(html).toContain("30 dias úteis");
    expect(html).toContain("45 dias úteis");
    // Should have a table structure
    expect(html).toContain("<table");
    expect(html).toContain("Total:");
  });

  it("generates {{ambientes_prazos_lista}} as <ul>", () => {
    const html = buildContractHtml(template, data);
    expect(html).toContain("<ul");
    expect(html).toContain("<li>");
    expect(html).toContain("Cozinha");
  });

  it("generates {{ambientes_detalhes_completos}} with technical fields", () => {
    const html = buildContractHtml(template, data);

    expect(html).toContain("MDF Branco");
    expect(html).toContain("Laca Cinza");
    expect(html).toContain("Perfil");
    expect(html).toContain("MDP Carvalho");
    expect(html).toContain("Laca Preta");
    expect(html).toContain("Cava");
    expect(html).toContain("Espelho");
    expect(html).toContain("Modelo Y");
  });

  it("generates combined supplier deadlines in {{prazo_entrega_fornecedor}}", () => {
    const html = buildContractHtml(template, data);
    expect(html).toContain("Fornecedor geral: 30 dias úteis, 45 dias úteis");
  });

  it("overrides static imported template values with the current saved data", () => {
    const importedTemplate = `
      <p><strong>Cliente:</strong> Maria Antiga</p>
      <p><strong>CPF:</strong> 999.999.999-99</p>
      <p><strong>Nº do Contrato:</strong> CT-OLD</p>
      <p><strong>Forma de Pagamento:</strong> Boleto antigo</p>
      <p><strong>Valor Final:</strong> R$ 1.000,00</p>
      <p><strong>Entrada:</strong> R$ 100,00</p>
      <p><strong>Parcelas:</strong> 2x de R$ 450,00</p>
    `;

    const html = buildContractHtml(importedTemplate, data);

    const normalizedHtml = html.replace(/\u00a0/g, " ");

    expect(normalizedHtml).toContain("<strong>Cliente:</strong> João Silva");
    expect(normalizedHtml).toContain("<strong>CPF:</strong> 123.456.789-00");
    expect(normalizedHtml).toContain("<strong>Nº do Contrato:</strong> CT-999");
    expect(normalizedHtml).toContain("<strong>Valor Final:</strong> R$ 8.000,00");
    expect(normalizedHtml).toContain("<strong>Entrada:</strong> R$ 1.000,00");
    expect(normalizedHtml).toContain("<strong>Parcelas:</strong> 10x de R$ 800,00");
    expect(html).not.toContain("Maria Antiga");
    expect(html).not.toContain("CT-OLD");
  });
});
