/**
 * Pre-built contract templates for the visual editor.
 * Each template generates PageData[] with positioned elements.
 */

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "line" | "text" | "image" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  textAlign: string;
  color: string;
  imageUrl?: string;
  zIndex: number;
  tableData?: string[][];
  tableCols?: number;
  tableRows?: number;
}

interface PageData {
  id: string;
  elements: CanvasElement[];
  backgroundImage?: string;
  backgroundOpacity: number;
}

let _tplCounter = 9000;
function tplId() { return `tpl_${++_tplCounter}_${Date.now()}`; }

function makeText(x: number, y: number, w: number, h: number, text: string, opts: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: tplId(), type: "text", x, y, width: w, height: h, rotation: 0,
    fill: "transparent", stroke: "transparent", strokeWidth: 0, borderRadius: 0,
    text, fontFamily: "Arial", fontSize: 14, fontWeight: "normal",
    fontStyle: "normal", textDecoration: "none", textAlign: "left",
    color: "#000000", zIndex: ++_tplCounter,
    ...opts,
  };
}

function makeRect(x: number, y: number, w: number, h: number, opts: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: tplId(), type: "rect", x, y, width: w, height: h, rotation: 0,
    fill: "#ffffff", stroke: "#000000", strokeWidth: 1, borderRadius: 0,
    text: "", fontFamily: "Arial", fontSize: 14, fontWeight: "normal",
    fontStyle: "normal", textDecoration: "none", textAlign: "left",
    color: "#000000", zIndex: ++_tplCounter,
    ...opts,
  };
}

function makeLine(x: number, y: number, w: number, opts: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: tplId(), type: "line", x, y, width: w, height: 2, rotation: 0,
    fill: "transparent", stroke: "#333333", strokeWidth: 1, borderRadius: 0,
    text: "", fontFamily: "Arial", fontSize: 14, fontWeight: "normal",
    fontStyle: "normal", textDecoration: "none", textAlign: "left",
    color: "#000000", zIndex: ++_tplCounter,
    ...opts,
  };
}

function makeTable(x: number, y: number, w: number, h: number, data: string[][]): CanvasElement {
  return {
    id: tplId(), type: "table", x, y, width: w, height: h, rotation: 0,
    fill: "#ffffff", stroke: "#333333", strokeWidth: 1, borderRadius: 0,
    text: "", fontFamily: "Arial", fontSize: 11, fontWeight: "normal",
    fontStyle: "normal", textDecoration: "none", textAlign: "left",
    color: "#000000", zIndex: ++_tplCounter,
    tableData: data,
    tableRows: data.length,
    tableCols: data[0]?.length || 2,
  };
}

export interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  pages: PageData[];
}

export function getContractTemplates(): ContractTemplate[] {
  return [
    {
      id: "venda-moveis",
      name: "Venda de Móveis Planejados",
      description: "Contrato completo para venda de móveis sob medida — tabelas auto-adaptativas por ambiente e catálogo",
      icon: "🪑",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            // ── Header ──
            makeRect(0, 0, 794, 80, { fill: "#0891b2", stroke: "transparent", borderRadius: 0 }),
            // Logo da empresa (carregado automaticamente das configurações)
            makeText(10, 8, 70, 64, "{{logo_empresa}}", { fontSize: 10, color: "#ffffff", textAlign: "center" }),
            makeText(85, 6, 350, 24, "{{empresa_nome}}", { fontSize: 20, fontWeight: "bold", color: "#ffffff" }),
            makeText(85, 30, 350, 14, "{{empresa_subtitulo}}", { fontSize: 10, color: "#e0f2fe" }),
            makeText(85, 44, 350, 14, "{{endereco_loja}}, {{bairro_loja}} — {{cidade_loja}}/{{uf_loja}} — CEP: {{cep_loja}}", { fontSize: 8, color: "#e0f2fe" }),
            makeText(85, 58, 350, 14, "CNPJ: {{cnpj_loja}}  |  Tel: {{telefone_loja}}  |  {{email_loja}}", { fontSize: 8, color: "#e0f2fe" }),
            makeText(450, 12, 300, 18, "CONTRATO DE VENDA", { fontSize: 16, fontWeight: "bold", color: "#ffffff", textAlign: "right" }),
            makeText(450, 32, 300, 15, "Nº Contrato: {{numero_contrato}}", { fontSize: 10, color: "#e0f2fe", textAlign: "right" }),
            makeText(450, 48, 300, 15, "Nº Orçamento: {{numero_orcamento}}", { fontSize: 10, color: "#e0f2fe", textAlign: "right" }),
            makeText(450, 64, 300, 15, "Data: {{data_contrato}}", { fontSize: 10, color: "#e0f2fe", textAlign: "right" }),

            // ── Dados do Cliente ──
            makeText(40, 100, 714, 25, "DADOS DO CLIENTE", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 122, 714),
            makeText(40, 130, 350, 20, "Nome: {{nome_cliente}}"),
            makeText(400, 130, 350, 20, "CPF/CNPJ: {{cpf_cliente}}"),
            makeText(40, 155, 350, 20, "RG/Insc. Estadual: {{rg_insc_estadual}}"),
            makeText(400, 155, 350, 20, "Telefone: {{telefone_cliente}}"),
            makeText(40, 180, 350, 20, "E-mail: {{email_cliente}}"),
            makeText(400, 180, 350, 20, "Profissão: {{profissao}}"),
            makeText(40, 205, 350, 20, "Tipo de Contrato: {{tipo_contrato}}"),
            makeText(400, 205, 350, 20, "Prazo de Entrega: {{prazo_entrega}}"),
            makeText(40, 230, 714, 20, "Endereço: {{endereco}}, {{bairro}} — {{cidade}}/{{uf}} — CEP: {{cep}}"),

            // ── Endereço de Entrega ──
            makeText(40, 265, 714, 25, "ENDEREÇO DE ENTREGA", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 287, 714),
            makeText(40, 295, 714, 20, "Endereço: {{endereco_entrega}}"),
            makeText(40, 320, 350, 20, "Bairro: {{bairro_entrega}}"),
            makeText(400, 320, 350, 20, "Cidade: {{cidade_entrega}} / {{uf_entrega}}"),
            makeText(40, 345, 350, 20, "CEP: {{cep_entrega}}"),
            makeText(400, 345, 350, 20, "Complemento: {{complemento_entrega}}"),

            // ── Tabela 1: Ambientes e Valores (auto-adaptativa) ──
            makeText(40, 430, 714, 25, "AMBIENTES E VALORES", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 452, 714),
            makeText(40, 460, 714, 20, "{{ambientes_valores_tabela}}", { fontSize: 11 }),

            // ── Tabela 2: Detalhes dos Ambientes (auto-adaptativa) ──
            makeText(40, 430, 714, 25, "DETALHES DOS AMBIENTES", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 452, 714),
            makeText(40, 460, 714, 20, "{{ambientes_cores_tabela}}", { fontSize: 11 }),

            // ── Tabela 3: Produtos do Catálogo (auto-adaptativa) ──
            makeText(40, 500, 714, 25, "PRODUTOS DO CATÁLOGO", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 522, 714),
            makeText(40, 530, 714, 20, "{{produtos_catalogo_completo}}", { fontSize: 11 }),

            // ── Observações (campo livre) ──
            makeText(40, 570, 714, 25, "OBSERVAÇÕES", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 592, 714),
            makeRect(40, 598, 714, 100, { fill: "#f8fafc", stroke: "#e2e8f0", borderRadius: 4, strokeWidth: 1 }),
            makeText(46, 604, 702, 88, "{{observacoes}}", { fontSize: 11, color: "#374151" }),

            // ── Resumo Financeiro ──
            makeText(40, 720, 714, 25, "RESUMO FINANCEIRO", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 742, 714),
            makeText(40, 750, 350, 20, "Valor Total: {{valor_tela}}"),
            makeText(400, 750, 350, 20, "Desconto: {{valor_desconto}} ({{percentual_desconto}})"),
            makeText(40, 775, 350, 20, "Forma de Pagamento: {{forma_pagamento}}"),
            makeText(400, 775, 350, 20, "Parcelas: {{parcelas}}x {{valor_parcela}}"),
            makeText(40, 800, 350, 20, "Entrada: {{valor_entrada}}"),
            makeText(400, 800, 350, 20, "Restante: {{valor_restante}}"),
            makeRect(40, 830, 714, 50, { fill: "#f0fdfa", stroke: "#0891b2", borderRadius: 6, text: "VALOR FINAL: {{valor_final}}\n{{valor_por_extenso}}", fontSize: 16, fontWeight: "bold", color: "#0891b2", textAlign: "center" }),
          ],
        },
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            // ── Page 2: Condições e Assinaturas ──
            makeRect(0, 0, 794, 50, { fill: "#0891b2", stroke: "transparent" }),
            makeText(10, 8, 40, 34, "{{logo_empresa}}", { fontSize: 8, color: "#ffffff", textAlign: "center" }),
            makeText(55, 12, 400, 25, "CONTRATO DE VENDA — {{empresa_nome}}", { fontSize: 13, fontWeight: "bold", color: "#ffffff" }),
            makeText(500, 15, 254, 20, "Nº {{numero_contrato}}", { fontSize: 10, color: "#e0f2fe", textAlign: "right" }),

            makeText(40, 70, 714, 25, "CONDIÇÕES GERAIS", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 92, 714),
            makeText(40, 100, 714, 966, "1. O prazo de entrega é de {{prazo_entrega}} dias úteis a partir da confirmação do pedido e aprovação do projeto.\n\n2. A garantia dos produtos é de {{prazo_garantia}} contra defeitos de fabricação, conforme termos do fabricante.\n\n3. O pagamento deve ser realizado conforme a forma escolhida: {{condicoes_pagamento}}.\n\n4. Em caso de cancelamento pelo COMPRADOR após a aprovação do projeto, será cobrada multa de 30% sobre o valor total do contrato.\n\n5. Alterações no projeto após aprovação poderão acarretar custos adicionais e alteração no prazo de entrega.\n\n6. A montagem está inclusa no valor do contrato, salvo disposição em contrário.\n\n7. O COMPRADOR deverá garantir acesso adequado ao local de entrega e montagem.\n\n8. Eventuais avarias no imóvel pré-existentes devem ser informadas antes da montagem.\n\n9. A validade desta proposta é de {{validade_proposta}}.\n\n10. Este contrato é regido pelas leis brasileiras, elegendo o foro da comarca de {{cidade}} para dirimir quaisquer questões.", { fontSize: 11, color: "#374151" }),

            makeText(40, 400, 714, 25, "OBSERVAÇÕES", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 422, 714),
            makeText(40, 430, 714, 80, "{{observacoes}}", { fontSize: 11, color: "#374151" }),

            makeText(40, 540, 714, 25, "RESPONSÁVEIS", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 562, 714),
            makeText(40, 570, 350, 20, "Vendedor: {{responsavel_venda}}"),
            makeText(400, 570, 350, 20, "Projetista: {{projetista}}"),
            makeText(40, 595, 350, 20, "Indicador: {{indicador_nome}}"),
            makeText(400, 595, 350, 20, "Nº Orçamento: {{numero_orcamento}}"),

            // ── Assinaturas ──
            makeText(40, 680, 714, 20, "{{cidade}}, {{data_atual}}", { textAlign: "center", fontSize: 12 }),

            makeText(40, 740, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 765, 340, 20, "{{empresa_nome}}", { textAlign: "center", fontSize: 11 }),
            makeText(40, 785, 340, 15, "CNPJ: {{cnpj_loja}}", { textAlign: "center", fontSize: 9, color: "#6b7280" }),

            makeText(414, 740, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(414, 765, 340, 20, "{{nome_cliente}}", { textAlign: "center", fontSize: 11 }),
            makeText(414, 785, 340, 15, "CPF: {{cpf_cliente}}", { textAlign: "center", fontSize: 9, color: "#6b7280" }),

            // ── Telefones Úteis da Empresa ──
            makeLine(40, 820, 714),
            makeText(40, 830, 714, 20, "TELEFONES ÚTEIS", { fontSize: 12, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 848, 714),
            makeText(40, 855, 714, 18, "{{telefones_uteis}}", { fontSize: 10, color: "#374151" }),
            makeText(40, 920, 714, 15, "E-mail: {{email_loja}}", { fontSize: 10, color: "#374151" }),
          ],
        },
      ],
    },
    {
      id: "termo-garantia",
      name: "Termo de Garantia",
      description: "Termo de garantia para produtos ou serviços prestados",
      icon: "🛡️",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 70, { fill: "#7c3aed", stroke: "transparent" }),
            makeText(40, 18, 500, 30, "TERMO DE GARANTIA", { fontSize: 20, fontWeight: "bold", color: "#ffffff" }),
            makeText(40, 48, 300, 18, "Nº {{numero_garantia}}", { fontSize: 11, color: "#ddd6fe" }),

            makeText(40, 90, 714, 20, "DADOS DO PRODUTO / SERVIÇO", { fontSize: 12, fontWeight: "bold", color: "#7c3aed" }),
            makeLine(40, 108, 714, { stroke: "#7c3aed" }),
            makeText(40, 115, 714, 20, "Produto/Serviço: {{produto_descricao}}"),
            makeText(40, 138, 350, 20, "Nº de Série / Lote: {{numero_serie}}"),
            makeText(400, 138, 350, 20, "Data da Compra: {{data_compra}}"),
            makeText(40, 161, 350, 20, "Nota Fiscal: {{nota_fiscal}}"),
            makeText(400, 161, 350, 20, "Valor: {{valor_produto}}"),

            makeText(40, 200, 714, 20, "DADOS DO COMPRADOR", { fontSize: 12, fontWeight: "bold", color: "#7c3aed" }),
            makeLine(40, 218, 714, { stroke: "#7c3aed" }),
            makeText(40, 225, 714, 20, "Nome: {{cliente_nome}}"),
            makeText(40, 248, 350, 20, "CPF: {{cliente_cpf}}"),
            makeText(400, 248, 350, 20, "Telefone: {{cliente_telefone}}"),
            makeText(40, 271, 714, 20, "Endereço: {{cliente_endereco}}"),

            makeText(40, 310, 714, 20, "COBERTURA DA GARANTIA", { fontSize: 12, fontWeight: "bold", color: "#7c3aed" }),
            makeLine(40, 328, 714, { stroke: "#7c3aed" }),
            makeTable(40, 335, 714, 120, [
              ["Item", "Período", "Cobertura"],
              ["Defeitos de fabricação", "{{prazo_garantia_fabricacao}}", "Total"],
              ["Desgaste natural", "{{prazo_garantia_desgaste}}", "Parcial"],
              ["Mão de obra", "{{prazo_garantia_mao_obra}}", "Total"],
            ]),

            makeText(40, 475, 714, 20, "EXCLUSÕES DA GARANTIA", { fontSize: 12, fontWeight: "bold", color: "#7c3aed" }),
            makeLine(40, 493, 714, { stroke: "#7c3aed" }),
            makeText(40, 500, 714, 120, "A garantia NÃO cobre:\n\n• Danos causados por mau uso, negligência ou acidentes\n• Desgaste natural de componentes consumíveis\n• Modificações ou reparos realizados por terceiros não autorizados\n• Danos causados por eventos de força maior (enchentes, incêndios, etc.)\n• Uso em desacordo com o manual de instruções", { fontSize: 11, color: "#374151" }),

            makeText(40, 640, 714, 20, "PROCEDIMENTO PARA ACIONAMENTO", { fontSize: 12, fontWeight: "bold", color: "#7c3aed" }),
            makeLine(40, 658, 714, { stroke: "#7c3aed" }),
            makeText(40, 665, 714, 80, "Para acionar a garantia, o comprador deverá:\n1. Entrar em contato pelo telefone {{empresa_telefone}} ou e-mail {{empresa_email}}\n2. Apresentar este Termo de Garantia e a Nota Fiscal\n3. Descrever o defeito apresentado", { fontSize: 11, color: "#374151" }),

            makeText(40, 770, 714, 20, "DISPOSIÇÕES GERAIS", { fontSize: 12, fontWeight: "bold", color: "#7c3aed" }),
            makeLine(40, 788, 714, { stroke: "#7c3aed" }),
            makeText(40, 795, 714, 50, "Este termo é válido a partir da data da compra e pelo período especificado acima. Fica eleito o foro da comarca de {{cidade_foro}} para resolução de litígios.", { fontSize: 11, color: "#374151" }),

            makeText(40, 870, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 895, 340, 15, "{{empresa_nome}}", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(414, 870, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(414, 895, 340, 15, "{{cliente_nome}}", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
          ],
        },
      ],
    },
    {
      id: "acordo-confidencialidade",
      name: "Acordo de Confidencialidade (NDA)",
      description: "Acordo de não divulgação para proteção de informações sigilosas",
      icon: "🔒",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 70, { fill: "#1e293b", stroke: "transparent" }),
            makeText(40, 18, 600, 30, "ACORDO DE CONFIDENCIALIDADE", { fontSize: 18, fontWeight: "bold", color: "#ffffff" }),
            makeText(40, 48, 300, 18, "NDA — Non-Disclosure Agreement", { fontSize: 10, color: "#94a3b8" }),

            makeText(40, 90, 714, 20, "PARTE DIVULGADORA", { fontSize: 12, fontWeight: "bold", color: "#1e293b" }),
            makeLine(40, 108, 714, { stroke: "#1e293b" }),
            makeText(40, 115, 714, 20, "Razão Social: {{empresa_nome}}"),
            makeText(40, 138, 350, 20, "CNPJ: {{empresa_cnpj}}"),
            makeText(400, 138, 350, 20, "Representante: {{empresa_representante}}"),

            makeText(40, 175, 714, 20, "PARTE RECEPTORA", { fontSize: 12, fontWeight: "bold", color: "#1e293b" }),
            makeLine(40, 193, 714, { stroke: "#1e293b" }),
            makeText(40, 200, 714, 20, "Nome/Razão Social: {{cliente_nome}}"),
            makeText(40, 223, 350, 20, "CPF/CNPJ: {{cliente_cpf}}"),
            makeText(400, 223, 350, 20, "Cargo: {{cliente_cargo}}"),

            makeText(40, 260, 714, 20, "OBJETO", { fontSize: 12, fontWeight: "bold", color: "#1e293b" }),
            makeLine(40, 278, 714, { stroke: "#1e293b" }),
            makeText(40, 285, 714, 60, "O presente Acordo tem por objeto estabelecer as condições de confidencialidade sobre as informações trocadas entre as partes no contexto de:\n\n{{objeto_acordo}}", { fontSize: 11, color: "#374151" }),

            makeText(40, 360, 714, 20, "DEFINIÇÃO DE INFORMAÇÃO CONFIDENCIAL", { fontSize: 12, fontWeight: "bold", color: "#1e293b" }),
            makeLine(40, 378, 714, { stroke: "#1e293b" }),
            makeText(40, 385, 714, 100, "Considera-se 'Informação Confidencial' toda e qualquer informação, seja oral, escrita, digital ou em qualquer outro formato, incluindo, mas não se limitando a:\n\n• Dados comerciais, financeiros e estratégicos\n• Projetos, desenhos técnicos e especificações\n• Listas de clientes, fornecedores e parceiros\n• Processos, métodos e know-how\n• Software, códigos-fonte e algoritmos", { fontSize: 11, color: "#374151" }),

            makeText(40, 500, 714, 20, "OBRIGAÇÕES DA PARTE RECEPTORA", { fontSize: 12, fontWeight: "bold", color: "#1e293b" }),
            makeLine(40, 518, 714, { stroke: "#1e293b" }),
            makeText(40, 525, 714, 120, "A Parte Receptora compromete-se a:\n\n1. Manter sigilo absoluto sobre as Informações Confidenciais\n2. Não divulgar, copiar ou reproduzir sem autorização prévia por escrito\n3. Utilizar as informações exclusivamente para os fins deste Acordo\n4. Restringir o acesso apenas a colaboradores que necessitem conhecê-las\n5. Devolver ou destruir todas as informações ao término deste Acordo", { fontSize: 11, color: "#374151" }),

            makeText(40, 665, 714, 20, "VIGÊNCIA E PENALIDADES", { fontSize: 12, fontWeight: "bold", color: "#1e293b" }),
            makeLine(40, 683, 714, { stroke: "#1e293b" }),
            makeText(40, 690, 714, 80, "Este Acordo vigorará por {{prazo_vigencia}} a partir da assinatura, podendo ser renovado por acordo mútuo.\n\nEm caso de descumprimento, a Parte Receptora estará sujeita a multa de {{valor_multa}}, sem prejuízo de indenização por perdas e danos, além de responsabilização civil e criminal.", { fontSize: 11, color: "#374151" }),

            makeRect(40, 790, 714, 40, { fill: "#f1f5f9", stroke: "#1e293b", borderRadius: 6, text: "Data de assinatura: {{data_contrato}} — {{cidade_foro}}", fontSize: 12, color: "#1e293b", textAlign: "center" }),

            makeText(40, 860, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 885, 340, 15, "PARTE DIVULGADORA", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(414, 860, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(414, 885, 340, 15, "PARTE RECEPTORA", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
          ],
        },
      ],
    },
    {
      id: "ordem-servico",
      name: "Ordem de Serviço",
      description: "Modelo completo de OS com checklist de serviços e materiais",
      icon: "🔧",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 70, { fill: "#b45309", stroke: "transparent" }),
            makeText(40, 18, 400, 30, "ORDEM DE SERVIÇO", { fontSize: 20, fontWeight: "bold", color: "#ffffff" }),
            makeText(40, 48, 200, 18, "OS Nº {{numero_os}}", { fontSize: 11, color: "#fde68a" }),
            makeText(500, 25, 254, 20, "Data: {{data_os}}", { fontSize: 12, color: "#fde68a", textAlign: "right" }),
            makeText(500, 48, 254, 18, "Prioridade: {{prioridade}}", { fontSize: 11, color: "#fde68a", textAlign: "right" }),

            makeText(40, 90, 714, 20, "SOLICITANTE", { fontSize: 12, fontWeight: "bold", color: "#b45309" }),
            makeLine(40, 108, 714, { stroke: "#b45309" }),
            makeText(40, 115, 350, 20, "Nome: {{cliente_nome}}"),
            makeText(400, 115, 350, 20, "Tel: {{cliente_telefone}}"),
            makeText(40, 138, 714, 20, "Endereço: {{cliente_endereco}}"),

            makeText(40, 175, 714, 20, "DESCRIÇÃO DO SERVIÇO", { fontSize: 12, fontWeight: "bold", color: "#b45309" }),
            makeLine(40, 193, 714, { stroke: "#b45309" }),
            makeText(40, 200, 714, 60, "{{descricao_servico}}", { fontSize: 11, color: "#374151" }),

            makeText(40, 275, 714, 20, "SERVIÇOS REALIZADOS", { fontSize: 12, fontWeight: "bold", color: "#b45309" }),
            makeLine(40, 293, 714, { stroke: "#b45309" }),
            makeTable(40, 300, 714, 140, [
              ["Serviço", "Qtd", "Valor Unit.", "Subtotal"],
              ["{{servico_1}}", "{{qtd_1}}", "{{valor_unit_1}}", "{{subtotal_1}}"],
              ["{{servico_2}}", "{{qtd_2}}", "{{valor_unit_2}}", "{{subtotal_2}}"],
              ["{{servico_3}}", "{{qtd_3}}", "{{valor_unit_3}}", "{{subtotal_3}}"],
            ]),

            makeText(40, 460, 714, 20, "MATERIAIS UTILIZADOS", { fontSize: 12, fontWeight: "bold", color: "#b45309" }),
            makeLine(40, 478, 714, { stroke: "#b45309" }),
            makeTable(40, 485, 714, 110, [
              ["Material", "Qtd", "Valor"],
              ["{{material_1}}", "{{qtd_mat_1}}", "{{valor_mat_1}}"],
              ["{{material_2}}", "{{qtd_mat_2}}", "{{valor_mat_2}}"],
            ]),

            makeText(40, 615, 714, 20, "RESUMO FINANCEIRO", { fontSize: 12, fontWeight: "bold", color: "#b45309" }),
            makeLine(40, 633, 714, { stroke: "#b45309" }),
            makeText(40, 640, 350, 20, "Mão de Obra: {{valor_mao_obra}}"),
            makeText(400, 640, 350, 20, "Materiais: {{valor_materiais}}"),
            makeRect(40, 670, 714, 45, { fill: "#fffbeb", stroke: "#b45309", borderRadius: 6, text: "TOTAL: {{valor_total}}", fontSize: 18, fontWeight: "bold", color: "#b45309", textAlign: "center" }),

            makeText(40, 735, 714, 20, "OBSERVAÇÕES", { fontSize: 12, fontWeight: "bold", color: "#b45309" }),
            makeLine(40, 753, 714, { stroke: "#b45309" }),
            makeText(40, 760, 714, 60, "{{observacoes}}", { fontSize: 11, color: "#374151" }),

            makeText(40, 850, 230, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 875, 230, 15, "Técnico Responsável", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(282, 850, 230, 20, "______________________________", { textAlign: "center" }),
            makeText(282, 875, 230, 15, "Solicitante", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(524, 850, 230, 20, "______________________________", { textAlign: "center" }),
            makeText(524, 875, 230, 15, "Aprovação", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
          ],
        },
      ],
    },
    {
      id: "recibo-pagamento",
      name: "Recibo de Pagamento",
      description: "Recibo comprovante de pagamento com dados do pagador e beneficiário",
      icon: "💰",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 60, { fill: "#15803d", stroke: "transparent" }),
            makeText(40, 15, 500, 28, "RECIBO DE PAGAMENTO", { fontSize: 20, fontWeight: "bold", color: "#ffffff" }),
            makeText(550, 20, 204, 20, "Nº {{numero_recibo}}", { fontSize: 12, color: "#bbf7d0", textAlign: "right" }),

            makeRect(40, 80, 714, 55, { fill: "#f0fdf4", stroke: "#15803d", borderRadius: 8, text: "VALOR: {{valor_total}}", fontSize: 28, fontWeight: "bold", color: "#15803d", textAlign: "center" }),
            makeText(40, 140, 714, 18, "({{valor_extenso}})", { fontSize: 11, color: "#6b7280", textAlign: "center" }),

            makeText(40, 180, 714, 20, "PAGADOR", { fontSize: 12, fontWeight: "bold", color: "#15803d" }),
            makeLine(40, 198, 714, { stroke: "#15803d" }),
            makeText(40, 205, 714, 20, "Nome: {{cliente_nome}}"),
            makeText(40, 228, 350, 20, "CPF/CNPJ: {{cliente_cpf}}"),
            makeText(400, 228, 350, 20, "Tel: {{cliente_telefone}}"),
            makeText(40, 251, 714, 20, "Endereço: {{cliente_endereco}}"),

            makeText(40, 290, 714, 20, "BENEFICIÁRIO", { fontSize: 12, fontWeight: "bold", color: "#15803d" }),
            makeLine(40, 308, 714, { stroke: "#15803d" }),
            makeText(40, 315, 714, 20, "Razão Social: {{empresa_nome}}"),
            makeText(40, 338, 350, 20, "CNPJ: {{empresa_cnpj}}"),
            makeText(400, 338, 350, 20, "Tel: {{empresa_telefone}}"),

            makeText(40, 378, 714, 20, "DETALHAMENTO", { fontSize: 12, fontWeight: "bold", color: "#15803d" }),
            makeLine(40, 396, 714, { stroke: "#15803d" }),
            makeTable(40, 403, 714, 110, [
              ["Descrição", "Referência", "Valor"],
              ["{{descricao_pagamento}}", "{{referencia}}", "{{valor_item}}"],
              ["Desconto", "—", "{{desconto}}"],
              ["Total Pago", "—", "{{valor_total}}"],
            ]),

            makeText(40, 535, 714, 20, "FORMA DE PAGAMENTO", { fontSize: 12, fontWeight: "bold", color: "#15803d" }),
            makeLine(40, 553, 714, { stroke: "#15803d" }),
            makeText(40, 560, 350, 20, "Forma: {{forma_pagamento}}"),
            makeText(400, 560, 350, 20, "Data: {{data_pagamento}}"),
            makeText(40, 583, 714, 20, "Observações: {{observacoes_pagamento}}"),

            makeRect(40, 625, 714, 50, { fill: "#f0fdf4", stroke: "#15803d", borderRadius: 6 }),
            makeText(50, 635, 694, 30, "Declaro ter recebido a importância acima especificada, referente aos serviços/produtos descritos, dando plena e total quitação.", { fontSize: 10, color: "#374151" }),

            makeText(40, 710, 714, 18, "{{cidade_foro}}, {{data_pagamento}}", { fontSize: 12, color: "#374151", textAlign: "center" }),

            makeText(200, 770, 394, 20, "______________________________", { textAlign: "center" }),
            makeText(200, 795, 394, 15, "{{empresa_nome}}", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(200, 810, 394, 15, "Beneficiário", { textAlign: "center", fontSize: 9, color: "#9ca3af" }),
          ],
        },
      ],
    },
    {
      id: "em-branco",
      name: "Em Branco",
      description: "Página em branco para criar seu contrato do zero",
      icon: "📄",
      pages: [{ id: tplId(), elements: [], backgroundOpacity: 0.5 }],
    },
  ];
}
