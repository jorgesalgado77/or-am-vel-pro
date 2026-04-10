/**
 * Sample data for real-time preview of contract variables in the visual editor.
 * Maps {{variable}} placeholders to example values.
 */

export const SAMPLE_PREVIEW_DATA: Record<string, string> = {
  // Client
  "{{nome_cliente}}": "Maria Fernanda da Silva",
  "{{cpf_cliente}}": "123.456.789-00",
  "{{rg_insc_estadual}}": "12.345.678-9",
  "{{telefone_cliente}}": "(11) 98765-4321",
  "{{email_cliente}}": "maria.silva@email.com",
  "{{profissao}}": "Arquiteta",
  "{{data_nascimento}}": "15/03/1985",

  // Address
  "{{endereco}}": "Rua das Flores, 456",
  "{{bairro}}": "Jardim América",
  "{{cidade}}": "São Paulo",
  "{{uf}}": "SP",
  "{{cep}}": "01234-567",

  // Delivery address
  "{{endereco_entrega}}": "Av. Paulista, 1000 — Apto 302",
  "{{bairro_entrega}}": "Bela Vista",
  "{{cidade_entrega}}": "São Paulo",
  "{{uf_entrega}}": "SP",
  "{{cep_entrega}}": "01310-100",
  "{{complemento_entrega}}": "Bloco B, Apto 302",
  "{{endereco_entrega_completo}}": "Av. Paulista, 1000 — Apto 302, Bela Vista, São Paulo - SP, CEP: 01310-100",

  // Company
  "{{empresa_nome}}": "MóveisMax Planejados",
  "{{empresa_subtitulo}}": "Móveis sob medida com qualidade e design",
  "{{logo_empresa}}": "🏢",
  "{{logo_empresa_url}}": "",
  "{{cnpj_loja}}": "12.345.678/0001-99",
  "{{endereco_loja}}": "Rua do Comércio, 100",
  "{{bairro_loja}}": "Centro",
  "{{cidade_loja}}": "São Paulo",
  "{{uf_loja}}": "SP",
  "{{cep_loja}}": "01000-000",
  "{{telefone_loja}}": "(11) 3456-7890",
  "{{email_loja}}": "contato@moveismax.com.br",

  // Contract
  "{{numero_orcamento}}": "ORC-2025-0042",
  "{{numero_contrato}}": "CTR-2025-0042",
  "{{data_contrato}}": "09/04/2026",
  "{{data_atual}}": "09 de abril de 2026",
  "{{data_fechamento}}": "09/04/2026",
  "{{responsavel_venda}}": "Carlos Souza",
  "{{projetista}}": "Ana Beatriz Lima",
  "{{indicador_nome}}": "José Pereira",
  "{{indicador_comissao}}": "3",

  // Financial
  "{{valor_tela}}": "R$ 48.500,00",
  "{{valor_final}}": "R$ 45.000,00",
  "{{valor_com_desconto}}": "R$ 45.000,00",
  "{{valor_entrada}}": "R$ 15.000,00",
  "{{valor_restante}}": "R$ 30.000,00",
  "{{valor_parcela}}": "R$ 5.000,00",
  "{{parcelas}}": "6",
  "{{forma_pagamento}}": "Cartão de Crédito",
  "{{valor_desconto}}": "R$ 3.500,00",
  "{{percentual_desconto}}": "7,2%",
  "{{condicoes_pagamento}}": "Valor total: R$ 45.000,00 | Entrada: R$ 15.000,00 | 6x de R$ 5.000,00 | Forma: Cartão de Crédito",
  "{{valor_por_extenso}}": "quarenta e cinco mil reais",
  "{{valor_total_ambientes}}": "R$ 38.000,00",
  "{{valor_total_produtos}}": "R$ 7.000,00",
  "{{total_ambientes}}": "R$ 38.000,00",
  "{{quantidade_ambientes}}": "3",

  // Deadlines & Guarantee
  "{{prazo_entrega}}": "45",
  "{{prazo_garantia}}": "5 anos",
  "{{garantia}}": "5 anos contra defeitos de fabricação",
  "{{validade_proposta}}": "15 dias",
  "{{data_entrega_prevista}}": "25/05/2026",
  "{{prazo_entrega_fornecedor}}": "30 dias úteis, 45 dias úteis",
  "{{observacoes}}": "Cliente solicita instalação aos sábados. Verificar acesso pelo elevador de serviço.",
  "{{cidade_foro}}": "São Paulo",

  // Per-environment (static examples)
  "{{nome_ambiente_1}}": "Cozinha",
  "{{nome_ambiente_2}}": "Quarto Casal",
  "{{nome_ambiente_3}}": "Home Office",
  "{{valor_ambiente_1}}": "R$ 18.000,00",
  "{{valor_ambiente_2}}": "R$ 12.000,00",
  "{{valor_ambiente_3}}": "R$ 8.000,00",
  "{{fornecedor_ambiente_1}}": "Duratex",
  "{{fornecedor_ambiente_2}}": "Eucatex",
  "{{fornecedor_ambiente_3}}": "Duratex",
  "{{prazo_entrega_ambiente_1}}": "30 dias",
  "{{prazo_entrega_ambiente_2}}": "45 dias",
  "{{prazo_entrega_ambiente_3}}": "30 dias",
  "{{corpo_ambiente_1}}": "MDF Branco TX",
  "{{corpo_ambiente_2}}": "MDF Carvalho",
  "{{corpo_ambiente_3}}": "MDF Branco TX",
  "{{porta_ambiente_1}}": "Laca Cinza Fosco",
  "{{porta_ambiente_2}}": "Laca Branca Brilho",
  "{{porta_ambiente_3}}": "Laca Grafite",
  "{{puxador_ambiente_1}}": "Perfil Inox Escovado",
  "{{puxador_ambiente_2}}": "Cava Alumínio",
  "{{puxador_ambiente_3}}": "Perfil Preto Fosco",
  "{{complemento_ambiente_1}}": "Vidro Reflecta",
  "{{complemento_ambiente_2}}": "Espelho Bronze",
  "{{complemento_ambiente_3}}": "—",
  "{{modelo_ambiente_1}}": "Linear Gourmet",
  "{{modelo_ambiente_2}}": "Classic Plus",
  "{{modelo_ambiente_3}}": "Compact Pro",

  // Per-environment extra fields
  "{{titulos_ambiente_1}}": "Cozinha",
  "{{titulos_ambiente_2}}": "Quarto Casal",
  "{{titulos_ambiente_3}}": "Home Office",
  "{{quantidade_ambiente_1}}": "1",
  "{{quantidade_ambiente_2}}": "1",
  "{{quantidade_ambiente_3}}": "1",
  "{{descricao_ambiente_1}}": "Cozinha",
  "{{descricao_ambiente_2}}": "Quarto Casal",
  "{{descricao_ambiente_3}}": "Home Office",

  // Per-catalog-product
  "{{quantidade_produtos_catalogo}}": "3",
  "{{produto_catalogo_nome_1}}": "Puxador Gola",
  "{{produto_catalogo_codigo_1}}": "PUX-001",
  "{{produto_catalogo_qtd_1}}": "6",
  "{{produto_catalogo_valor_1}}": "R$ 450,00",
  "{{produto_catalogo_subtotal_1}}": "R$ 2.700,00",
  "{{produto_catalogo_nome_2}}": "Fita LED",
  "{{produto_catalogo_codigo_2}}": "LED-003",
  "{{produto_catalogo_qtd_2}}": "3",
  "{{produto_catalogo_valor_2}}": "R$ 280,00",
  "{{produto_catalogo_subtotal_2}}": "R$ 840,00",
  "{{produto_catalogo_nome_3}}": "Dobradiça Slow",
  "{{produto_catalogo_codigo_3}}": "DOB-010",
  "{{produto_catalogo_qtd_3}}": "8",
  "{{produto_catalogo_valor_3}}": "R$ 180,00",
  "{{produto_catalogo_subtotal_3}}": "R$ 1.440,00",

  // Template-specific (old format)
  "{{cliente_nome}}": "Maria Fernanda da Silva",
  "{{cliente_cpf}}": "123.456.789-00",
  "{{cliente_telefone}}": "(11) 98765-4321",
  "{{cliente_email}}": "maria.silva@email.com",
  "{{cliente_endereco}}": "Rua das Flores, 456 — Jardim América — São Paulo/SP",
  "{{ambiente_1}}": "Cozinha",
  "{{ambiente_2}}": "Quarto Casal",
  "{{ambiente_3}}": "Home Office",
  "{{pecas_1}}": "42 peças",
  "{{pecas_2}}": "28 peças",
  "{{pecas_3}}": "18 peças",
  "{{valor_1}}": "R$ 18.000,00",
  "{{valor_2}}": "R$ 12.000,00",
  "{{valor_3}}": "R$ 8.000,00",
  "{{desconto_total}}": "R$ 3.500,00",

  // Smart auto-adaptive tables (rendered as HTML)
  "{{ambientes_valores_tabela}}": `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
    <tr style="background:#0891b2;color:#fff;"><th>Ambiente</th><th>Peças</th><th>Valor</th></tr>
    <tr><td>Cozinha</td><td>42 peças</td><td style="text-align:right">R$ 18.000,00</td></tr>
    <tr><td>Quarto Casal</td><td>28 peças</td><td style="text-align:right">R$ 12.000,00</td></tr>
    <tr><td>Home Office</td><td>18 peças</td><td style="text-align:right">R$ 8.000,00</td></tr>
    <tr style="font-weight:bold;background:#f0fdfa;"><td colspan="2" style="text-align:right">Total:</td><td style="text-align:right">R$ 38.000,00</td></tr>
  </table>`,

  "{{ambientes_cores_tabela}}": `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
    <tr style="background:#0891b2;color:#fff;"><th>Ambiente</th><th>Cor Caixa</th><th>Cor Portas</th><th>Ferragens</th><th>Observações</th></tr>
    <tr><td>Cozinha</td><td>MDF Branco TX</td><td>Laca Cinza Fosco</td><td>Perfil Inox Escovado</td><td>Vidro Reflecta</td></tr>
    <tr><td>Quarto Casal</td><td>MDF Carvalho</td><td>Laca Branca Brilho</td><td>Cava Alumínio</td><td>Espelho Bronze</td></tr>
    <tr><td>Home Office</td><td>MDF Branco TX</td><td>Laca Grafite</td><td>Perfil Preto Fosco</td><td>—</td></tr>
  </table>`,

  "{{produtos_catalogo_completo}}": `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
    <tr style="background:#0891b2;color:#fff;"><th>Código</th><th>Qtd</th><th>Produto</th><th>Descrição</th><th>Valor Venda</th><th>Prazo</th><th>Obs</th></tr>
    <tr><td style="font-family:monospace;">PUX-001</td><td style="text-align:center;">6</td><td>Puxador Gola</td><td>Alumínio 160mm</td><td style="text-align:right;">R$ 450,00</td><td>15 dias</td><td>—</td></tr>
    <tr><td style="font-family:monospace;">LED-003</td><td style="text-align:center;">3</td><td>Fita LED</td><td>Branco Quente 5m</td><td style="text-align:right;">R$ 280,00</td><td>7 dias</td><td>Incluir fonte</td></tr>
    <tr><td style="font-family:monospace;">DOB-010</td><td style="text-align:center;">8</td><td>Dobradiça Slow</td><td>165° Clip-top</td><td style="text-align:right;">R$ 180,00</td><td>10 dias</td><td>—</td></tr>
    <tr style="font-weight:bold;background:#f0fdfa;"><td colspan="4" style="text-align:right;">Subtotal:</td><td style="text-align:right;">R$ 7.000,00</td><td colspan="2"></td></tr>
  </table>`,

  "{{produtos_catalogo}}": "(ver tabela de produtos)",
  "{{itens_tabela}}": "(ver tabela de ambientes)",
  "{{itens_detalhes}}": "(ver tabela de detalhes)",
  "{{ambientes_prazos}}": "(ver tabela de prazos)",
  "{{ambientes_prazos_lista}}": "(ver lista de prazos)",
  "{{ambientes_detalhes_completos}}": "(ver tabela completa)",

  "{{telefones_uteis}}": `<table border="1" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:10px;">
    <tr style="background:#0891b2;color:#fff;"><th>Setor</th><th>Responsável</th><th>Telefone</th></tr>
    <tr><td>Financeiro</td><td>Maria Silva</td><td>(11)99999-0001</td></tr>
    <tr><td>Projeto</td><td>João Santos</td><td>(11)99999-0002</td></tr>
    <tr><td>Montagem</td><td>Carlos Oliveira</td><td>(11)99999-0003</td></tr>
  </table>`,
  "{{telefone_util_setor_1}}": "Financeiro",
  "{{telefone_util_responsavel_1}}": "Maria Silva",
  "{{telefone_util_numero_1}}": "(11)99999-0001",
  "{{telefone_util_setor_2}}": "Projeto",
  "{{telefone_util_responsavel_2}}": "João Santos",
  "{{telefone_util_numero_2}}": "(11)99999-0002",
};

/**
 * Replace all {{variable}} in text with sample data for preview.
 * Variables that contain HTML tables are returned as-is for iframe rendering.
 */
export function replaceVariablesWithSample(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [key, val] of Object.entries(SAMPLE_PREVIEW_DATA)) {
    result = result.split(key).join(val);
  }
  return result;
}

/**
 * Check if a variable value contains HTML (for smart tables).
 */
export function isHtmlVariable(varName: string): boolean {
  const val = SAMPLE_PREVIEW_DATA[varName];
  return !!val && val.includes("<table");
}

// ── Conditional Formatting ──

export interface ConditionalRule {
  id: string;
  type: "greater" | "less" | "equal" | "between" | "text_contains" | "text_starts" | "empty" | "not_empty";
  value1: string;
  value2?: string; // for "between"
  bgColor: string;
  textColor: string;
  bold?: boolean;
}

export interface ConditionalPreset {
  id: string;
  name: string;
  icon: string;
  rules: ConditionalRule[];
  builtIn?: boolean;
}

export const DEFAULT_CONDITIONAL_RULES: ConditionalRule[] = [
  { id: "high_value", type: "greater", value1: "10000", bgColor: "#dcfce7", textColor: "#166534", bold: true },
  { id: "low_value", type: "less", value1: "1000", bgColor: "#fef2f2", textColor: "#991b1b", bold: false },
  { id: "zero", type: "equal", value1: "0", bgColor: "#fef9c3", textColor: "#854d0e", bold: false },
];

export const BUILT_IN_PRESETS: ConditionalPreset[] = [
  {
    id: "preset_valores_padrao", name: "Valores Padrão", icon: "💰", builtIn: true,
    rules: DEFAULT_CONDITIONAL_RULES,
  },
  {
    id: "preset_semaforo", name: "Semáforo (Verde/Amarelo/Vermelho)", icon: "🚦", builtIn: true,
    rules: [
      { id: "sem_green", type: "greater", value1: "5000", bgColor: "#dcfce7", textColor: "#166534", bold: true },
      { id: "sem_yellow", type: "between", value1: "1000", value2: "5000", bgColor: "#fef9c3", textColor: "#854d0e", bold: false },
      { id: "sem_red", type: "less", value1: "1000", bgColor: "#fef2f2", textColor: "#991b1b", bold: false },
    ],
  },
  {
    id: "preset_destaque_alto", name: "Destacar Valores Altos", icon: "📈", builtIn: true,
    rules: [
      { id: "alto_20k", type: "greater", value1: "20000", bgColor: "#c084fc", textColor: "#581c87", bold: true },
      { id: "alto_10k", type: "greater", value1: "10000", bgColor: "#dbeafe", textColor: "#1e40af", bold: true },
    ],
  },
  {
    id: "preset_status", name: "Status (Texto)", icon: "✅", builtIn: true,
    rules: [
      { id: "st_ok", type: "text_contains", value1: "ok", bgColor: "#dcfce7", textColor: "#166534", bold: true },
      { id: "st_pend", type: "text_contains", value1: "pendente", bgColor: "#fef9c3", textColor: "#854d0e", bold: false },
      { id: "st_cancel", type: "text_contains", value1: "cancelado", bgColor: "#fef2f2", textColor: "#991b1b", bold: false },
      { id: "st_empty", type: "empty", value1: "", bgColor: "#f1f5f9", textColor: "#64748b", bold: false },
    ],
  },
  {
    id: "preset_prazo", name: "Prazos (dias)", icon: "📅", builtIn: true,
    rules: [
      { id: "pz_urg", type: "less", value1: "7", bgColor: "#fef2f2", textColor: "#991b1b", bold: true },
      { id: "pz_med", type: "between", value1: "7", value2: "30", bgColor: "#fef9c3", textColor: "#854d0e", bold: false },
      { id: "pz_ok", type: "greater", value1: "30", bgColor: "#dcfce7", textColor: "#166534", bold: false },
    ],
  },
];

const CUSTOM_PRESETS_KEY = "contract_conditional_presets";

export function loadCustomPresets(): ConditionalPreset[] {
  try {
    const saved = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

export function saveCustomPresets(presets: ConditionalPreset[]) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

export function getAllPresets(): ConditionalPreset[] {
  return [...BUILT_IN_PRESETS, ...loadCustomPresets()];
}

function parseCurrencyValue(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Evaluate a conditional formatting rule against a cell value.
 */
export function matchesConditionalRule(cellValue: string, rule: ConditionalRule): boolean {
  const numVal = parseCurrencyValue(cellValue);

  switch (rule.type) {
    case "greater":
      return numVal !== null && numVal > parseFloat(rule.value1);
    case "less":
      return numVal !== null && numVal < parseFloat(rule.value1);
    case "equal":
      if (numVal !== null) return numVal === parseFloat(rule.value1);
      return cellValue.trim().toLowerCase() === rule.value1.trim().toLowerCase();
    case "between": {
      const v2 = parseFloat(rule.value2 || "0");
      return numVal !== null && numVal >= parseFloat(rule.value1) && numVal <= v2;
    }
    case "text_contains":
      return cellValue.toLowerCase().includes(rule.value1.toLowerCase());
    case "text_starts":
      return cellValue.toLowerCase().startsWith(rule.value1.toLowerCase());
    case "empty":
      return !cellValue.trim();
    case "not_empty":
      return !!cellValue.trim();
    default:
      return false;
  }
}

/**
 * Get the first matching conditional formatting style for a cell.
 */
export function getConditionalStyle(
  cellValue: string,
  rules: ConditionalRule[],
  isHeader: boolean,
): React.CSSProperties | null {
  if (isHeader || !cellValue) return null;
  for (const rule of rules) {
    if (matchesConditionalRule(cellValue, rule)) {
      return {
        backgroundColor: rule.bgColor,
        color: rule.textColor,
        fontWeight: rule.bold ? "bold" : undefined,
      };
    }
  }
  return null;
}
