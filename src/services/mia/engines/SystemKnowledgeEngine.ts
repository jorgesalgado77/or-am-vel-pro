/**
 * SystemKnowledgeEngine — Complete system workflow knowledge for MIA.
 *
 * Provides structured knowledge about:
 * - All system modules and their purposes
 * - Complete sales workflow (step-by-step)
 * - Role-specific guidance (Vendedor, Projetista, Gerente, Admin)
 * - Where to click, what fields to fill, what to expect
 * - Proactive suggestions based on context
 *
 * This engine does NOT call external APIs — it returns structured
 * knowledge that is injected into the system prompt.
 */

export interface SystemFlowStep {
  step: number;
  title: string;
  description: string;
  where: string; // "Menu > Clientes" or navigation target
  navTarget?: string;
  fields?: string[];
  tips?: string[];
}

export interface ModuleKnowledge {
  name: string;
  description: string;
  navTarget: string;
  icon: string;
  allowedCargos: string[];
  quickActions: string[];
  commonQuestions: Array<{ q: string; a: string }>;
}

export type CargoType = "vendedor" | "projetista" | "gerente" | "administrador" | "tecnico" | "default";

// ── Complete Sales Flow ────────────────────────────────────────

const SALES_FLOW: SystemFlowStep[] = [
  {
    step: 1,
    title: "Captação do Lead",
    description: "O lead chega pelo Funil de Captação (landing page, WhatsApp ou cadastro manual). Ele aparece automaticamente no Kanban de Clientes na coluna 'Novo'.",
    where: "Menu lateral > Funil de Captação ou Clientes",
    navTarget: "funnel",
    tips: [
      "Leads vindos do WhatsApp são captados automaticamente pelo Bot de Qualificação",
      "O sistema atribui o vendedor com base nas regras de distribuição da loja",
      "Leads manuais podem ser cadastrados clicando em '+ Novo Cliente' no Kanban",
    ],
  },
  {
    step: 2,
    title: "Atendimento Inicial",
    description: "O vendedor recebe uma notificação e inicia o atendimento pelo Chat de Vendas (VendaZap). A IA analisa o perfil DISC do cliente e sugere abordagens personalizadas.",
    where: "Menu lateral > Chat de Vendas",
    navTarget: "vendazap-chat",
    fields: ["Mensagem de apresentação", "Perguntas de qualificação"],
    tips: [
      "Use o modo 'Assistido' para que a IA sugira respostas antes de enviar",
      "O perfil DISC é detectado automaticamente após algumas mensagens",
      "A IA identifica a temperatura do lead (Quente/Morno/Frio)",
    ],
  },
  {
    step: 3,
    title: "Agendamento de Medição",
    description: "Para projetos sob medida, o vendedor agenda uma medição técnica. Isso cria uma tarefa para o técnico e move o card no Kanban Técnico.",
    where: "Kanban Técnico > Botão 'Agendar Medição'",
    navTarget: "measurements",
    fields: ["Data", "Horário", "Endereço do cliente", "Técnico responsável"],
    tips: [
      "O KM total de ida e volta é calculado automaticamente via Google Maps",
      "O técnico recebe notificação push e a tarefa aparece no calendário dele",
      "Reagendamentos exigem motivo obrigatório",
    ],
  },
  {
    step: 4,
    title: "Preenchimento do Briefing",
    description: "O projetista preenche o briefing com as necessidades do cliente: ambientes, medidas, preferências de estilo, cores e materiais.",
    where: "Ficha do Cliente > Aba Briefing",
    navTarget: "briefing",
    fields: ["Ambientes desejados", "Medidas", "Estilo", "Orçamento estimado", "Preferências de cores/materiais"],
    tips: [
      "O briefing pode ser preenchido durante a visita técnica",
      "Quanto mais detalhado, melhor será a simulação",
    ],
  },
  {
    step: 5,
    title: "Criação da Simulação/Orçamento",
    description: "No Simulador, crie o orçamento detalhado com ambientes planejados e produtos do catálogo. O sistema calcula automaticamente descontos, financiamento e comissões.",
    where: "Menu lateral > Simulador",
    navTarget: "simulator",
    fields: ["Ambientes (lista)", "Produtos do catálogo", "Desconto à vista", "Forma de pagamento", "Parcelas", "Valor de entrada"],
    tips: [
      "A IA de Estratégia sugere a melhor abordagem de desconto",
      "O 'Desconto Plus' é aplicado antes do financiamento",
      "A estratégia 'Extrema' requer senha de gerente",
      "Verifique o estoque dos produtos antes de finalizar",
    ],
  },
  {
    step: 6,
    title: "Negociação",
    description: "Use o Deal Room para negociações ao vivo com videoconferência, ou continue pelo Chat de Vendas. A IA Fechadora detecta sinais de compra e sugere propostas.",
    where: "Menu lateral > Deal Room ou Chat de Vendas",
    navTarget: "dealroom",
    tips: [
      "A IA detecta objeções e sugere argumentos do Banco de Argumentos",
      "O Deal Room oferece transcrição em tempo real",
      "A probabilidade de fechamento aparece quando > 40%",
    ],
  },
  {
    step: 7,
    title: "Geração do Contrato",
    description: "Ao fechar a venda, gere o contrato automaticamente. O sistema preenche dados do cliente, valores, condições de pagamento e cláusulas.",
    where: "Simulador > Botão 'Gerar Contrato' ou Deal Room > 'Fechar Venda'",
    navTarget: "simulator",
    fields: ["Dados do cliente (auto)", "Valores (auto)", "Forma de pagamento", "Data de entrega"],
    tips: [
      "O contrato pode ser exportado em PDF",
      "Produtos com estoque insuficiente geram tarefa automática de compra para o Admin",
      "O card do cliente move automaticamente para 'Fechado' no Kanban",
    ],
  },
  {
    step: 8,
    title: "Acompanhamento Pós-Venda",
    description: "Após o fechamento, acompanhe a produção, entrega e satisfação do cliente. O módulo de Acompanhamento registra o progresso por ambiente.",
    where: "Menu lateral > Contratos / Acompanhamento",
    navTarget: "contracts",
    tips: [
      "O projetista acompanha a produção por ambiente",
      "O sistema alerta sobre prazos críticos",
      "A satisfação do cliente impacta o score do vendedor",
    ],
  },
];

// ── Module Knowledge Base ──────────────────────────────────────

const MODULES: ModuleKnowledge[] = [
  {
    name: "Dashboard",
    description: "Visão geral de indicadores, faturamento, leads, conversões e alertas. Gráficos de desempenho e ranking de vendedores.",
    navTarget: "dashboard",
    icon: "📊",
    allowedCargos: ["todos"],
    quickActions: ["Ver faturamento do mês", "Verificar leads parados", "Analisar taxa de conversão"],
    commonQuestions: [
      { q: "Como ver meu faturamento?", a: "No Dashboard, o card 'Faturamento' mostra o valor do mês atual. Vendedores veem apenas seus dados, Gerentes veem a equipe toda." },
      { q: "Como saber quantos leads tenho?", a: "No Dashboard, veja o card 'Leads Abertos'. Para detalhes, abra o Kanban de Clientes." },
    ],
  },
  {
    name: "Kanban de Clientes",
    description: "Gestão visual de clientes em colunas: Novo, Em Negociação, Proposta Enviada, Fechado, Perdido. Arraste cards para mudar status.",
    navTarget: "clients",
    icon: "👥",
    allowedCargos: ["todos"],
    quickActions: ["Cadastrar novo cliente", "Mover cliente para negociação", "Ver detalhes do cliente"],
    commonQuestions: [
      { q: "Como cadastrar um cliente?", a: "Clique no botão '+ Novo Cliente' no topo do Kanban. Preencha: Nome, Telefone, Email, Vendedor responsável." },
      { q: "Como mover um cliente de etapa?", a: "Arraste o card do cliente para a coluna desejada, ou abra o card e altere o status." },
    ],
  },
  {
    name: "Chat de Vendas (VendaZap)",
    description: "Chat em tempo real com clientes via WhatsApp. IA sugere respostas, detecta perfil DISC e temperatura do lead.",
    navTarget: "vendazap-chat",
    icon: "💬",
    allowedCargos: ["vendedor", "gerente", "administrador"],
    quickActions: ["Responder cliente", "Ativar AutoPilot", "Ver perfil DISC", "Enviar copy persuasiva"],
    commonQuestions: [
      { q: "Como ativar a IA automática?", a: "No chat, mude o modo para 'Automático' no seletor do topo. A IA responderá sozinha." },
      { q: "O que é o perfil DISC?", a: "É uma análise comportamental do cliente (D=Direto, I=Influente, S=Estável, C=Conforme). A IA detecta automaticamente." },
    ],
  },
  {
    name: "Simulador de Propostas",
    description: "Crie orçamentos detalhados com ambientes planejados, produtos do catálogo, descontos e financiamento.",
    navTarget: "simulator",
    icon: "🧮",
    allowedCargos: ["vendedor", "projetista", "gerente", "administrador"],
    quickActions: ["Criar nova simulação", "Adicionar ambiente", "Aplicar desconto", "Gerar contrato"],
    commonQuestions: [
      { q: "Como criar um orçamento?", a: "Abra o Simulador, selecione o cliente, adicione ambientes e produtos. O sistema calcula automaticamente." },
      { q: "Como aplicar desconto?", a: "Na seção de descontos: Desconto 1 (à vista), Desconto 2 (condicional), Desconto 3 (especial). A IA de Estratégia pode sugerir." },
    ],
  },
  {
    name: "Deal Room",
    description: "Sala de negociação com videoconferência, transcrição ao vivo, chat dual (WhatsApp + Sala) e análise de IA.",
    navTarget: "dealroom",
    icon: "🎯",
    allowedCargos: ["vendedor", "gerente", "administrador"],
    quickActions: ["Iniciar reunião", "Ver transcrição", "Analisar objeções"],
    commonQuestions: [
      { q: "Como iniciar uma reunião?", a: "No Deal Room, clique 'Nova Sessão', selecione o cliente e convide participantes." },
    ],
  },
  {
    name: "Catálogo de Produtos",
    description: "Gestão completa de produtos: código, preços, estoque, imagens, vídeos, link de compra para reposição.",
    navTarget: "products",
    icon: "📦",
    allowedCargos: ["administrador", "gerente"],
    quickActions: ["Cadastrar produto", "Verificar estoque", "Atualizar preço"],
    commonQuestions: [
      { q: "Como cadastrar um produto?", a: "Abra o Catálogo, clique '+ Novo Produto'. Preencha: Nome, Código, Custo, Markup, Fornecedor, Estoque." },
      { q: "Como controlar estoque?", a: "Cada produto tem campo de quantidade. Vendas subtraem automaticamente. Estoque baixo gera alerta no Dashboard." },
    ],
  },
  {
    name: "Tarefas",
    description: "Gestão de tarefas com Kanban e Calendário. Suporta lembretes, delegação e sincronização com Google Calendar.",
    navTarget: "tarefas",
    icon: "📋",
    allowedCargos: ["todos"],
    quickActions: ["Criar tarefa", "Ver tarefas de hoje", "Delegar tarefa"],
    commonQuestions: [
      { q: "Como criar uma tarefa?", a: "Diga 'criar tarefa' para mim ou clique '+ Nova Tarefa' no módulo de Tarefas." },
      { q: "Como delegar uma tarefa?", a: "Ao criar a tarefa, selecione outro responsável. Apenas Gerentes e Admins podem delegar." },
    ],
  },
  {
    name: "Financeiro",
    description: "Contas a pagar/receber, fluxo de caixa, folha de pagamento e comissões dos vendedores.",
    navTarget: "financeiro",
    icon: "💰",
    allowedCargos: ["administrador", "gerente"],
    quickActions: ["Ver contas a pagar", "Cadastrar conta", "Gerar relatório"],
    commonQuestions: [
      { q: "Como cadastrar uma conta?", a: "No Financeiro, clique '+ Nova Conta'. Preencha: Descrição, Valor, Vencimento, Tipo (pagar/receber)." },
    ],
  },
  {
    name: "Campanhas",
    description: "Criação e gestão de campanhas sazonais de marketing com templates e disparo via WhatsApp.",
    navTarget: "campaigns",
    icon: "📣",
    allowedCargos: ["gerente", "administrador"],
    quickActions: ["Criar campanha", "Ver resultados", "Disparar mensagens"],
    commonQuestions: [],
  },
  {
    name: "Configurações",
    description: "APIs, usuários, cargos, permissões, regras de venda, templates de contrato e preferências da loja.",
    navTarget: "configuracoes",
    icon: "⚙️",
    allowedCargos: ["administrador"],
    quickActions: ["Configurar APIs", "Gerenciar usuários", "Editar regras de venda"],
    commonQuestions: [
      { q: "Como configurar o WhatsApp?", a: "Vá em Configurações > APIs > WhatsApp. Escolha o provedor (Z-API ou Evolution) e insira as credenciais." },
    ],
  },
];

// ── Cargo-Specific Guidance ────────────────────────────────────

interface CargoGuidance {
  role: string;
  dailyRoutine: string[];
  priorities: string[];
  kpis: string[];
  commonNeeds: string[];
}

const CARGO_GUIDANCE: Record<CargoType, CargoGuidance> = {
  vendedor: {
    role: "Vendedor",
    dailyRoutine: [
      "1. Verificar novos leads atribuídos (Kanban > coluna 'Novo')",
      "2. Responder mensagens pendentes no Chat de Vendas",
      "3. Acompanhar negociações em andamento",
      "4. Criar simulações/orçamentos para clientes qualificados",
      "5. Follow-up com leads mornos/frios",
      "6. Registrar tarefas de acompanhamento",
    ],
    priorities: [
      "Responder leads quentes em até 5 minutos",
      "Nunca deixar mensagem sem resposta por mais de 1 hora",
      "Manter funil atualizado (mover cards no Kanban)",
      "Fazer follow-up a cada 48h com leads em negociação",
    ],
    kpis: ["Taxa de conversão", "Tempo médio de resposta", "Ticket médio", "Número de simulações geradas"],
    commonNeeds: [
      "Abrir chat de vendas para responder clientes",
      "Criar simulação para cliente",
      "Ver dados de um cliente específico",
      "Criar tarefa de follow-up",
      "Consultar estoque de produto",
    ],
  },
  projetista: {
    role: "Projetista",
    dailyRoutine: [
      "1. Verificar briefings pendentes",
      "2. Preparar simulações e orçamentos",
      "3. Acompanhar produção dos projetos em andamento",
      "4. Validar medições técnicas",
      "5. Atualizar status dos projetos",
    ],
    priorities: [
      "Completar briefings dentro do prazo",
      "Validar medidas técnicas antes de gerar orçamento",
      "Manter clientes informados sobre o andamento",
    ],
    kpis: ["Projetos entregues no prazo", "Precisão das simulações", "Satisfação do cliente"],
    commonNeeds: [
      "Abrir briefing de um cliente",
      "Criar simulação técnica",
      "Ver dados do projeto",
      "Acompanhar produção",
    ],
  },
  gerente: {
    role: "Gerente",
    dailyRoutine: [
      "1. Revisar indicadores do Dashboard",
      "2. Verificar leads parados e cobrar ações",
      "3. Analisar desempenho da equipe",
      "4. Aprovar descontos especiais",
      "5. Liberar estratégias de negociação",
      "6. Acompanhar metas de vendas",
    ],
    priorities: [
      "Garantir que nenhum lead fique parado mais de 48h",
      "Monitorar taxa de conversão da equipe",
      "Aprovar simulações com desconto acima do limite",
      "Cobrar follow-up de vendedores",
    ],
    kpis: ["Faturamento da equipe", "Taxa de conversão", "Leads parados", "Ticket médio"],
    commonNeeds: [
      "Ver relatório da loja",
      "Verificar leads parados",
      "Ver desempenho dos vendedores",
      "Aprovar desconto especial",
      "Verificar metas",
    ],
  },
  administrador: {
    role: "Administrador",
    dailyRoutine: [
      "1. Revisar Dashboard geral",
      "2. Verificar alertas de estoque baixo",
      "3. Gerenciar usuários e permissões",
      "4. Configurar regras de venda",
      "5. Acompanhar financeiro (contas a pagar/receber)",
      "6. Analisar relatórios comerciais",
    ],
    priorities: [
      "Manter estoque em dia",
      "Configurar APIs e integrações",
      "Garantir segurança e permissões corretas",
      "Acompanhar faturamento e metas globais",
    ],
    kpis: ["Faturamento total", "Margem de lucro", "Estoque crítico", "APIs funcionando"],
    commonNeeds: [
      "Ver relatório completo",
      "Verificar estoque baixo",
      "Configurar APIs",
      "Gerenciar usuários",
      "Ver financeiro",
    ],
  },
  tecnico: {
    role: "Técnico",
    dailyRoutine: [
      "1. Verificar medições agendadas para hoje",
      "2. Acessar o calendário de medições",
      "3. Realizar medições no local",
      "4. Registrar medidas no sistema",
      "5. Atualizar status da medição (concluída/reagendada)",
    ],
    priorities: [
      "Chegar no horário agendado",
      "Registrar todas as medidas com precisão",
      "Fotografar os ambientes",
      "Comunicar problemas imediatamente",
    ],
    kpis: ["Medições realizadas no prazo", "Taxa de reagendamento", "KM percorrido"],
    commonNeeds: [
      "Ver medições de hoje",
      "Abrir detalhes da medição",
      "Reagendar medição",
      "Ver calendário",
    ],
  },
  default: {
    role: "Usuário",
    dailyRoutine: [
      "1. Verificar notificações",
      "2. Acessar suas tarefas pendentes",
      "3. Navegar pelos módulos disponíveis",
    ],
    priorities: ["Manter tarefas em dia", "Responder notificações"],
    kpis: [],
    commonNeeds: ["Ver tarefas", "Navegar no sistema"],
  },
};

// ── Public API ─────────────────────────────────────────────────

export class SystemKnowledgeEngine {
  /**
   * Build a comprehensive system knowledge context string
   * for injection into the MIA system prompt.
   */
  buildSystemKnowledge(cargoNome?: string): string {
    const cargo = this.normalizeCargo(cargoNome);
    const guidance = CARGO_GUIDANCE[cargo];
    const parts: string[] = [];

    parts.push("\n=== CONHECIMENTO DO SISTEMA ORÇAMÓVEL PRO ===");
    parts.push(`\nVocê é a MIA, assistente inteligente do OrçaMóvel Pro.`);
    parts.push(`O usuário atual é um **${guidance.role}**.`);

    // Role-specific guidance
    parts.push(`\n## ROTINA DIÁRIA DO ${guidance.role.toUpperCase()}`);
    for (const item of guidance.dailyRoutine) {
      parts.push(item);
    }

    parts.push(`\n## PRIORIDADES`);
    for (const item of guidance.priorities) {
      parts.push(`• ${item}`);
    }

    if (guidance.kpis.length > 0) {
      parts.push(`\n## KPIs IMPORTANTES`);
      for (const kpi of guidance.kpis) {
        parts.push(`• ${kpi}`);
      }
    }

    // Sales flow summary
    parts.push(`\n## FLUXO COMPLETO DE VENDA`);
    for (const step of SALES_FLOW) {
      parts.push(`${step.step}. **${step.title}**: ${step.description}`);
    }

    // Available modules
    parts.push(`\n## MÓDULOS DO SISTEMA`);
    for (const mod of MODULES) {
      const accessible = mod.allowedCargos.includes("todos") || mod.allowedCargos.includes(cargo);
      if (accessible) {
        parts.push(`• ${mod.icon} **${mod.name}** — ${mod.description}`);
      }
    }

    // Teaching instructions
    parts.push(`\n## REGRAS DE RESPOSTA DA MIA`);
    parts.push(`1. SEMPRE responda com base no sistema real — não invente funcionalidades`);
    parts.push(`2. Indique ONDE clicar (ex: "Menu lateral > Simulador")`);
    parts.push(`3. Explique campos obrigatórios quando guiar o usuário`);
    parts.push(`4. Sugira próximos passos concretos após cada ação`);
    parts.push(`5. Priorize AÇÕES que levem ao fechamento de vendas`);
    parts.push(`6. Quando o usuário perguntar "como fazer X", dê um passo-a-passo`);
    parts.push(`7. Seja proativa: se detectar oportunidade, sugira ação`);
    parts.push(`8. Use tabelas markdown para dados estruturados`);
    parts.push(`9. Adapte o tom ao cargo: direto para gerentes, detalhado para novatos`);
    parts.push(`10. Nunca diga "não sei" sem sugerir alternativa`);

    return parts.join("\n");
  }

  /**
   * Get step-by-step guide for a specific flow.
   */
  getFlowGuide(flowName: string): string {
    const lower = flowName.toLowerCase();

    if (/cadastr|novo\s+cliente|captação|lead/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[0], SALES_FLOW[1]]);
    }
    if (/mediç|medida|técnic/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[2]]);
    }
    if (/briefing/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[3]]);
    }
    if (/simulaç|orçamento|proposta/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[4]]);
    }
    if (/negocia|deal|reunião/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[5]]);
    }
    if (/contrato|fechar|fechamento/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[6]]);
    }
    if (/pós-venda|acompanhamento|entrega/i.test(lower)) {
      return this.formatSteps([SALES_FLOW[7]]);
    }
    if (/completo|todo|inteiro|fluxo/i.test(lower)) {
      return this.formatSteps(SALES_FLOW);
    }

    return "";
  }

  /**
   * Get module-specific FAQ answers.
   */
  answerModuleFAQ(question: string): string | null {
    const lower = question.toLowerCase();
    for (const mod of MODULES) {
      for (const faq of mod.commonQuestions) {
        const keywords = faq.q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matchCount = keywords.filter(k => lower.includes(k)).length;
        if (matchCount >= 2) {
          return `${mod.icon} **${mod.name}**\n\n${faq.a}`;
        }
      }
    }
    return null;
  }

  /**
   * Get daily routine for a specific cargo.
   */
  getDailyRoutine(cargoNome?: string): string {
    const cargo = this.normalizeCargo(cargoNome);
    const guidance = CARGO_GUIDANCE[cargo];

    let result = `📋 **Rotina Diária do ${guidance.role}**\n\n`;
    for (const item of guidance.dailyRoutine) {
      result += `${item}\n`;
    }
    result += `\n**Prioridades:**\n`;
    for (const item of guidance.priorities) {
      result += `• ${item}\n`;
    }
    return result;
  }

  /**
   * Get proactive suggestions based on cargo.
   */
  getProactiveSuggestions(cargoNome?: string): string[] {
    const cargo = this.normalizeCargo(cargoNome);
    return CARGO_GUIDANCE[cargo].commonNeeds;
  }

  // ── Private ────────────────────────────────────────────────

  private normalizeCargo(cargoNome?: string): CargoType {
    if (!cargoNome) return "default";
    const lower = cargoNome.toLowerCase();
    if (lower.includes("admin") || lower.includes("administrador")) return "administrador";
    if (lower.includes("gerente")) return "gerente";
    if (lower.includes("vendedor") || lower.includes("consultor")) return "vendedor";
    if (lower.includes("projetista") || lower.includes("designer")) return "projetista";
    if (lower.includes("técnico") || lower.includes("tecnico") || lower.includes("medidor")) return "tecnico";
    return "default";
  }

  private formatSteps(steps: SystemFlowStep[]): string {
    const parts: string[] = [];
    for (const step of steps) {
      parts.push(`### ${step.step}. ${step.title}`);
      parts.push(step.description);
      parts.push(`📍 **Onde:** ${step.where}`);
      if (step.fields && step.fields.length > 0) {
        parts.push(`📝 **Campos:** ${step.fields.join(", ")}`);
      }
      if (step.tips && step.tips.length > 0) {
        parts.push(`💡 **Dicas:**`);
        for (const tip of step.tips) {
          parts.push(`  • ${tip}`);
        }
      }
      parts.push("");
    }
    return parts.join("\n");
  }
}

// ── Singleton ──────────────────────────────────────────────────

let instance: SystemKnowledgeEngine | null = null;

export function getSystemKnowledgeEngine(): SystemKnowledgeEngine {
  if (!instance) {
    instance = new SystemKnowledgeEngine();
  }
  return instance;
}
