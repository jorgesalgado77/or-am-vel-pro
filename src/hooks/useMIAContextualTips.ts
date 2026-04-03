/**
 * useMIAContextualTips — Returns relevant contextual tips
 * when the user navigates to specific modules.
 * Tips are shown once per session per module.
 */

const SESSION_KEY = "mia_ctx_tips_shown";

function getShownModules(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function markShown(module: string) {
  const shown = getShownModules();
  shown.add(module);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...shown]));
}

export interface ContextualTip {
  module: string;
  icon: string;
  message: string;
}

const MODULE_TIPS: Record<string, ContextualTip> = {
  simulator: {
    module: "Simulador",
    icon: "📐",
    message: `**💡 Dica do Simulador:**\n\n• Use o campo **"Ambiente"** para organizar os itens por cômodo\n• Ajuste o **desconto** e veja o impacto no valor final em tempo real\n• Após simular, clique em **"Gerar Proposta PDF"** para enviar ao cliente\n• Você pode adicionar produtos do **Catálogo** diretamente na simulação`,
  },
  clients: {
    module: "Kanban",
    icon: "📋",
    message: `**💡 Dica do Kanban:**\n\n• Arraste os cards entre colunas para atualizar o status do cliente\n• Cards parados em **"Novo"** por mais de 1 dia geram alertas automáticos\n• Clique no card para ver detalhes, histórico e ações rápidas\n• Use o filtro por **responsável** para focar nos seus leads`,
  },
  "vendazap-chat": {
    module: "Chat de Vendas",
    icon: "💬",
    message: `**💡 Dica do Chat:**\n\n• Responda rapidamente — clientes atendidos em até 5 minutos têm **3x mais chance** de fechar\n• Use os **atalhos de mensagem** para respostas padronizadas\n• Envie **fotos de produtos** e **simulações** diretamente pelo chat\n• A IA pode sugerir respostas — clique no ícone ✨ para ativar`,
  },
  dealroom: {
    module: "Deal Room",
    icon: "🤝",
    message: `**💡 Dica da Deal Room:**\n\n• Prepare o ambiente antes da reunião: simulação, catálogo e contrato prontos\n• Use o **espelhamento de chat** para mostrar a conversa ao vivo\n• A transcrição é salva automaticamente para consulta posterior\n• Compartilhe a tela com o cliente para apresentar a simulação`,
  },
  catalog: {
    module: "Catálogo",
    icon: "📦",
    message: `**💡 Dica do Catálogo:**\n\n• Cadastre fotos e vídeos dos produtos para enriquecer as apresentações\n• Defina o **preço mínimo** para evitar descontos abaixo do custo\n• Use o **link de compra** para facilitar a reposição de estoque\n• Importe produtos em massa via **CSV ou JSON**`,
  },
  financial: {
    module: "Financeiro",
    icon: "💰",
    message: `**💡 Dica do Financeiro:**\n\n• Cadastre todas as contas a pagar e receber para ter fluxo de caixa preciso\n• A folha de pagamento calcula comissões automaticamente\n• Use os filtros por período para acompanhar a saúde financeira\n• Exporte relatórios em PDF para compartilhar com sócios`,
  },
  tasks: {
    module: "Tarefas",
    icon: "✅",
    message: `**💡 Dica de Tarefas:**\n\n• Crie tarefas diretamente pelo chat da MIA: "criar tarefa para amanhã"\n• Use o **Calendário** para visualizar a agenda da semana\n• Tarefas vencidas ficam destacadas em vermelho\n• Delegue tarefas para membros da equipe definindo o responsável`,
  },
  funnel: {
    module: "Funil de Captação",
    icon: "🎯",
    message: `**💡 Dica do Funil:**\n\n• Monitore a taxa de conversão entre cada etapa do funil\n• Leads no topo do funil precisam de atenção rápida\n• Use campanhas para alimentar o funil com novos leads\n• Analise os motivos de perda para melhorar o processo`,
  },
  contracts: {
    module: "Contratos",
    icon: "📝",
    message: `**💡 Dica de Contratos:**\n\n• Configure seus **modelos de contrato** com variáveis automáticas (nome, valor, prazo)\n• Contratos podem ser gerados diretamente a partir de uma **simulação aprovada**\n• Use a **assinatura digital** para agilizar o fechamento\n• Acompanhe o status: rascunho → enviado → assinado → concluído`,
  },
  campaigns: {
    module: "Campanhas",
    icon: "📢",
    message: `**💡 Dica de Campanhas:**\n\n• Crie campanhas segmentadas por **perfil de cliente** e **região**\n• Acompanhe métricas de abertura, clique e conversão em tempo real\n• Use **templates prontos** para WhatsApp e email marketing\n• Campanhas ativas alimentam automaticamente o **Funil de Captação**`,
  },
  dashboard: {
    module: "Dashboard",
    icon: "📊",
    message: `**💡 Dica do Dashboard:**\n\n• O painel mostra seus **KPIs principais**: vendas, conversão e ticket médio\n• Use os filtros de período para comparar desempenho mensal\n• Clique nos gráficos para ver detalhes por vendedor ou produto\n• O ranking da equipe atualiza automaticamente com base nas vendas fechadas`,
  },
};

export function getContextualTip(activeView: string): ContextualTip | null {
  const tip = MODULE_TIPS[activeView];
  if (!tip) return null;

  const shown = getShownModules();
  if (shown.has(activeView)) return null;

  markShown(activeView);
  return tip;
}

export function resetContextualTips() {
  sessionStorage.removeItem(SESSION_KEY);
}
