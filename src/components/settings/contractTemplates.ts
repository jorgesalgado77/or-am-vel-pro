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
      description: "Contrato completo para venda de móveis sob medida com ambientes e valores",
      icon: "🪑",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 80, { fill: "#0891b2", stroke: "transparent", borderRadius: 0 }),
            makeText(40, 15, 400, 30, "{{empresa_nome}}", { fontSize: 24, fontWeight: "bold", color: "#ffffff" }),
            makeText(40, 48, 400, 20, "{{empresa_subtitulo}}", { fontSize: 12, color: "#e0f2fe" }),
            makeText(450, 25, 300, 20, "CONTRATO DE VENDA", { fontSize: 16, fontWeight: "bold", color: "#ffffff", textAlign: "right" }),
            makeText(450, 48, 300, 20, "Data: {{data_contrato}}", { fontSize: 11, color: "#e0f2fe", textAlign: "right" }),

            makeText(40, 100, 714, 25, "DADOS DO CLIENTE", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 122, 714),
            makeText(40, 130, 350, 20, "Nome: {{cliente_nome}}"),
            makeText(400, 130, 350, 20, "CPF: {{cliente_cpf}}"),
            makeText(40, 155, 350, 20, "Telefone: {{cliente_telefone}}"),
            makeText(400, 155, 350, 20, "E-mail: {{cliente_email}}"),
            makeText(40, 180, 714, 20, "Endereço: {{cliente_endereco}}"),

            makeText(40, 220, 714, 25, "AMBIENTES E VALORES", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 242, 714),
            makeTable(40, 250, 714, 150, [
              ["Ambiente", "Peças", "Valor"],
              ["{{ambiente_1}}", "{{pecas_1}}", "{{valor_1}}"],
              ["{{ambiente_2}}", "{{pecas_2}}", "{{valor_2}}"],
              ["{{ambiente_3}}", "{{pecas_3}}", "{{valor_3}}"],
            ]),

            makeText(40, 420, 714, 25, "RESUMO FINANCEIRO", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 442, 714),
            makeText(40, 450, 350, 20, "Valor Total: {{valor_tela}}"),
            makeText(400, 450, 350, 20, "Desconto: {{desconto_total}}"),
            makeText(40, 475, 350, 20, "Forma de Pagamento: {{forma_pagamento}}"),
            makeText(400, 475, 350, 20, "Parcelas: {{parcelas}}x {{valor_parcela}}"),
            makeRect(40, 505, 714, 50, { fill: "#f0fdfa", stroke: "#0891b2", borderRadius: 6, text: "VALOR FINAL: {{valor_final}}", fontSize: 18, fontWeight: "bold", color: "#0891b2", textAlign: "center" }),

            makeText(40, 580, 714, 25, "CONDIÇÕES GERAIS", { fontSize: 13, fontWeight: "bold", color: "#0891b2" }),
            makeLine(40, 602, 714),
            makeText(40, 610, 714, 180, "1. O prazo de entrega é de {{prazo_entrega}} dias úteis a partir da confirmação do pedido.\n\n2. A garantia dos produtos é de 5 (cinco) anos contra defeitos de fabricação.\n\n3. O pagamento deve ser realizado conforme a forma escolhida acima.\n\n4. Em caso de cancelamento pelo COMPRADOR após a produção, será cobrada multa de 30% sobre o valor total.\n\n5. Este contrato é regido pelas leis brasileiras, elegendo o foro da comarca de {{cidade_foro}} para dirimir quaisquer questões.", { fontSize: 11, color: "#374151" }),

            makeText(40, 820, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 845, 340, 20, "{{empresa_nome}}", { textAlign: "center", fontSize: 11 }),
            makeText(414, 820, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(414, 845, 340, 20, "{{cliente_nome}}", { textAlign: "center", fontSize: 11 }),
          ],
        },
      ],
    },
    {
      id: "prestacao-servicos",
      name: "Prestação de Serviços",
      description: "Contrato genérico para prestação de serviços com escopo e prazos",
      icon: "📋",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 70, { fill: "#1e40af", stroke: "transparent" }),
            makeText(40, 18, 500, 30, "CONTRATO DE PRESTAÇÃO DE SERVIÇOS", { fontSize: 18, fontWeight: "bold", color: "#ffffff" }),
            makeText(40, 48, 300, 18, "Nº {{numero_contrato}}", { fontSize: 11, color: "#bfdbfe" }),

            makeText(40, 90, 714, 20, "CONTRATANTE", { fontSize: 12, fontWeight: "bold", color: "#1e40af" }),
            makeLine(40, 108, 714, { stroke: "#1e40af" }),
            makeText(40, 115, 714, 20, "Nome/Razão Social: {{cliente_nome}}"),
            makeText(40, 138, 350, 20, "CPF/CNPJ: {{cliente_cpf}}"),
            makeText(400, 138, 350, 20, "Tel: {{cliente_telefone}}"),

            makeText(40, 175, 714, 20, "CONTRATADA", { fontSize: 12, fontWeight: "bold", color: "#1e40af" }),
            makeLine(40, 193, 714, { stroke: "#1e40af" }),
            makeText(40, 200, 714, 20, "Razão Social: {{empresa_nome}}"),
            makeText(40, 223, 350, 20, "CNPJ: {{empresa_cnpj}}"),

            makeText(40, 260, 714, 20, "OBJETO DO CONTRATO", { fontSize: 12, fontWeight: "bold", color: "#1e40af" }),
            makeLine(40, 278, 714, { stroke: "#1e40af" }),
            makeText(40, 285, 714, 80, "O presente contrato tem como objeto a prestação dos seguintes serviços:\n\n{{descricao_servico}}", { fontSize: 11, color: "#374151" }),

            makeText(40, 380, 714, 20, "VALORES E PAGAMENTO", { fontSize: 12, fontWeight: "bold", color: "#1e40af" }),
            makeLine(40, 398, 714, { stroke: "#1e40af" }),
            makeTable(40, 405, 714, 100, [
              ["Descrição", "Valor"],
              ["Serviço principal", "{{valor_servico}}"],
              ["Materiais", "{{valor_materiais}}"],
              ["Total", "{{valor_total}}"],
            ]),

            makeText(40, 525, 714, 20, "PRAZO", { fontSize: 12, fontWeight: "bold", color: "#1e40af" }),
            makeLine(40, 543, 714, { stroke: "#1e40af" }),
            makeText(40, 550, 714, 50, "O prazo para execução dos serviços é de {{prazo_execucao}} dias, iniciando em {{data_inicio}} com previsão de conclusão em {{data_fim}}.", { fontSize: 11, color: "#374151" }),

            makeText(40, 620, 714, 20, "CLÁUSULAS GERAIS", { fontSize: 12, fontWeight: "bold", color: "#1e40af" }),
            makeLine(40, 638, 714, { stroke: "#1e40af" }),
            makeText(40, 645, 714, 150, "1. A CONTRATADA se compromete a executar os serviços com qualidade e dentro do prazo estipulado.\n\n2. Qualquer alteração no escopo deverá ser acordada por escrito entre as partes.\n\n3. A rescisão poderá ser feita por qualquer parte com aviso prévio de 30 dias.\n\n4. Fica eleito o foro da comarca de {{cidade_foro}} para resolução de litígios.", { fontSize: 11, color: "#374151" }),

            makeText(40, 830, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 855, 340, 15, "CONTRATADA", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(414, 830, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(414, 855, 340, 15, "CONTRATANTE", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
          ],
        },
      ],
    },
    {
      id: "locacao",
      name: "Contrato de Locação",
      description: "Modelo para locação de imóvel ou equipamento",
      icon: "🏠",
      pages: [
        {
          id: tplId(), backgroundOpacity: 0.5, elements: [
            makeRect(0, 0, 794, 60, { fill: "#065f46", stroke: "transparent" }),
            makeText(40, 15, 600, 28, "CONTRATO DE LOCAÇÃO", { fontSize: 20, fontWeight: "bold", color: "#ffffff" }),
            makeText(40, 42, 200, 15, "Ref: {{numero_contrato}}", { fontSize: 10, color: "#a7f3d0" }),

            makeText(40, 80, 714, 20, "LOCADOR(A)", { fontSize: 12, fontWeight: "bold", color: "#065f46" }),
            makeLine(40, 98, 714, { stroke: "#065f46" }),
            makeText(40, 105, 714, 20, "Nome: {{locador_nome}}     CPF: {{locador_cpf}}"),
            makeText(40, 128, 714, 20, "Endereço: {{locador_endereco}}"),

            makeText(40, 160, 714, 20, "LOCATÁRIO(A)", { fontSize: 12, fontWeight: "bold", color: "#065f46" }),
            makeLine(40, 178, 714, { stroke: "#065f46" }),
            makeText(40, 185, 714, 20, "Nome: {{cliente_nome}}     CPF: {{cliente_cpf}}"),
            makeText(40, 208, 714, 20, "Endereço: {{cliente_endereco}}"),

            makeText(40, 245, 714, 20, "OBJETO DA LOCAÇÃO", { fontSize: 12, fontWeight: "bold", color: "#065f46" }),
            makeLine(40, 263, 714, { stroke: "#065f46" }),
            makeText(40, 270, 714, 40, "Imóvel situado em {{endereco_imovel}}, com área de {{area_imovel}} m².", { fontSize: 11 }),

            makeText(40, 325, 714, 20, "CONDIÇÕES FINANCEIRAS", { fontSize: 12, fontWeight: "bold", color: "#065f46" }),
            makeLine(40, 343, 714, { stroke: "#065f46" }),
            makeTable(40, 350, 714, 120, [
              ["Item", "Valor"],
              ["Aluguel mensal", "{{valor_aluguel}}"],
              ["Caução / Garantia", "{{valor_caucao}}"],
              ["Condomínio", "{{valor_condominio}}"],
              ["IPTU (mensal)", "{{valor_iptu}}"],
            ]),

            makeText(40, 490, 714, 20, "VIGÊNCIA", { fontSize: 12, fontWeight: "bold", color: "#065f46" }),
            makeLine(40, 508, 714, { stroke: "#065f46" }),
            makeText(40, 515, 714, 40, "O prazo da locação é de {{prazo_meses}} meses, com início em {{data_inicio}} e término em {{data_fim}}.", { fontSize: 11 }),

            makeText(40, 570, 714, 20, "CLÁUSULAS", { fontSize: 12, fontWeight: "bold", color: "#065f46" }),
            makeLine(40, 588, 714, { stroke: "#065f46" }),
            makeText(40, 595, 714, 180, "1. O pagamento do aluguel deverá ser efetuado até o dia {{dia_vencimento}} de cada mês.\n\n2. O imóvel deverá ser devolvido nas mesmas condições em que foi recebido.\n\n3. Não é permitida sublocação sem consentimento prévio do LOCADOR.\n\n4. Multa por atraso: {{multa_atraso}}% ao mês.\n\n5. Rescisão antecipada: multa proporcional de {{multa_rescisao}} meses de aluguel.", { fontSize: 11, color: "#374151" }),

            makeText(40, 810, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(40, 835, 340, 15, "LOCADOR(A)", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
            makeText(414, 810, 340, 20, "______________________________", { textAlign: "center" }),
            makeText(414, 835, 340, 15, "LOCATÁRIO(A)", { textAlign: "center", fontSize: 10, color: "#6b7280" }),
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
      id: "em-branco",
      name: "Em Branco",
      description: "Página em branco para criar seu contrato do zero",
      icon: "📄",
      pages: [{ id: tplId(), elements: [], backgroundOpacity: 0.5 }],
    },
  ];
}
