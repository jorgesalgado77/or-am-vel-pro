export interface Campaign {
  id: string;
  titulo: string;
  categoria: "cozinha" | "quarto" | "planejados" | "datas";
  plataforma: "facebook" | "instagram" | "google";
  headline: string;
  copy: string;
  cta: string;
  instrucoes: string[];
  hashtags?: string[];
}

export const SEASONAL_CAMPAIGNS: Campaign[] = [
  // DIA DAS MÃES
  {
    id: "maes-1",
    titulo: "Dia das Mães — Cozinha de Presente",
    categoria: "datas",
    plataforma: "facebook",
    headline: "💝 Dê a ela a cozinha dos sonhos!",
    copy: `Neste Dia das Mães, surpreenda com o melhor presente!

🎁 Cozinha Planejada com Projeto 3D GRÁTIS
✅ Parcelamento especial em até 60x
✅ Design exclusivo para sua mãe
✅ Entrega e montagem inclusa

A mãe que sempre cuidou de tudo merece um espaço que cuide dela.

📲 Garanta o presente perfeito agora!

⏰ Condições válidas somente até o Dia das Mães.`,
    cta: "Presenteie Sua Mãe",
    instrucoes: [
      "Inicie a campanha 3 semanas antes do Dia das Mães",
      "Use fotos de cozinhas com decoração aconchegante",
      "Segmente: homens e mulheres 25-55, interesse em presentes/decoração",
      "Orçamento sugerido: R$ 30-50/dia",
      "Crie senso de urgência com contagem regressiva",
    ],
    hashtags: ["#DiadasMães", "#PresentePraMãe", "#CozinhaPlanejada", "#MãeMerece"],
  },
  {
    id: "maes-2",
    titulo: "Dia das Mães — Quarto Especial",
    categoria: "datas",
    plataforma: "instagram",
    headline: "O quarto que sua mãe merece ✨",
    copy: `Ela merece descansar em um quarto dos sonhos! 🛏️

Neste Dia das Mães, transforme o espaço dela:

💜 Closet sob medida
💜 Armários organizados
💜 Projeto 3D de PRESENTE

Porque mãe merece o melhor espaço da casa!

👉 Toque em "Saiba Mais" e garanta!`,
    cta: "Saiba Mais",
    instrucoes: [
      "Use Reels com tour por quartos planejados bonitos",
      "Músicas emocionais trending para Dia das Mães",
      "Stories com contagem regressiva",
      "Público: filhos adultos 20-45 anos",
      "Orçamento: R$ 20-35/dia",
    ],
    hashtags: ["#DiadasMães", "#QuartoPlanejado", "#PresenteEspecial"],
  },
  // BLACK FRIDAY
  {
    id: "bf-1",
    titulo: "Black Friday — Mega Desconto",
    categoria: "datas",
    plataforma: "facebook",
    headline: "🖤 BLACK FRIDAY: Até 30% OFF + Projeto 3D Grátis",
    copy: `🚨 A MAIOR BLACK FRIDAY DE MÓVEIS PLANEJADOS! 🚨

Descontos REAIS de até 30% em:
🔥 Cozinhas Planejadas
🔥 Quartos sob Medida
🔥 Closets e Home Office
🔥 Salas e Banheiros

✅ Projeto 3D GRÁTIS
✅ Parcelamento em até 60x
✅ Entrega e montagem inclusa
✅ Materiais premium com garantia

⚡ APENAS ATÉ DOMINGO!

📲 Clique e garanta seu desconto!`,
    cta: "Garantir Meu Desconto",
    instrucoes: [
      "Comece com teasers 1 semana antes",
      "Use cores preto e dourado nos criativos",
      "Remarketing: quem visitou site/perfil nos últimos 30 dias",
      "Orçamento: R$ 50-100/dia durante a Black Friday",
      "Landing page com timer de contagem regressiva",
      "Campanha de email marketing complementar",
    ],
    hashtags: ["#BlackFriday", "#BlackFridayMoveis", "#DescontoReal", "#MoveisplanejadoS"],
  },
  {
    id: "bf-2",
    titulo: "Black Friday — Urgência Instagram",
    categoria: "datas",
    plataforma: "instagram",
    headline: "⚫ BLACK FRIDAY — Últimas horas! ⏰",
    copy: `CORRE QUE ESTÁ ACABANDO! 🏃‍♂️💨

🖤 Até 30% OFF em todos os ambientes
🎁 Projeto 3D GRÁTIS
💰 Parcele em até 60x

⏰ Só até MEIA-NOITE!

Não deixe pra depois. Essa oportunidade não volta!

👉 Link na bio!`,
    cta: "Garantir Agora",
    instrucoes: [
      "Publicar no último dia da Black Friday",
      "Stories com contagem regressiva hora a hora",
      "Reels com senso de urgência",
      "Público: remarketing + lookalike quente",
      "Orçamento: R$ 40-60/dia",
    ],
    hashtags: ["#BlackFriday", "#UltimasHoras", "#CorraQueAcaba"],
  },
  // NATAL
  {
    id: "natal-1",
    titulo: "Natal — Presente para a Casa",
    categoria: "datas",
    plataforma: "facebook",
    headline: "🎄 Natal com Casa Nova! Até 25% OFF",
    copy: `O melhor presente de Natal é uma casa renovada! 🎁

🎄 Promoção Especial de Natal:
✅ Até 25% de desconto
✅ Projeto 3D gratuito
✅ Parcelamento facilitado
✅ Entrega garantida*

Ambientes disponíveis:
🏠 Cozinha | Quarto | Sala | Escritório

Comece o ano novo com a casa dos sonhos!

📲 Solicite seu orçamento agora!

*Consulte prazos de entrega`,
    cta: "Quero Meu Presente de Natal",
    instrucoes: [
      "Inicie a campanha no início de dezembro",
      "Criativos com decoração natalina sutil",
      "Segmente: famílias 28-50, recém-casados, novos apartamentos",
      "Orçamento: R$ 30-50/dia",
      "Combine com campanha de email marketing",
    ],
    hashtags: ["#NatalComDesconto", "#CasaNova", "#PresenteDeNatal", "#MoveisplanejadoS"],
  },
  {
    id: "natal-2",
    titulo: "Natal — Último Minuto",
    categoria: "datas",
    plataforma: "instagram",
    headline: "🎅 Ainda dá tempo! Presenteie com móveis planejados",
    copy: `Sem ideia de presente? 🎁

Que tal dar o MELHOR presente de todos?

✨ Um ambiente planejado sob medida!

🎄 Projeto 3D grátis para presentear
💝 Vale-presente disponível
📋 Entrega programada

O presente que dura a vida toda! ❤️

👉 Toque em "Saiba Mais"!`,
    cta: "Saiba Mais",
    instrucoes: [
      "Publicar nas últimas 2 semanas de dezembro",
      "Ofereça vale-presente digital para download imediato",
      "Stories com música natalina trending",
      "Público amplo: 25-55 anos",
      "Orçamento: R$ 20-30/dia",
    ],
    hashtags: ["#NatalPresente", "#ValePresenteMoveis", "#UltimoMinuto"],
  },
  // ANO NOVO
  {
    id: "ano-1",
    titulo: "Ano Novo — Renove sua Casa",
    categoria: "datas",
    plataforma: "facebook",
    headline: "🎆 Ano Novo, Casa Nova! Projeto 3D Grátis",
    copy: `Comece o ano com tudo novo! 🎊

Aproveite as condições especiais de janeiro:
✅ Projeto 3D 100% gratuito
✅ Primeiro pagamento só em fevereiro
✅ Até 20% de desconto
✅ Todos os ambientes

Transforme sua casa em 2025! 🏠

📲 Agende sua visita técnica gratuita!`,
    cta: "Agendar Visita Grátis",
    instrucoes: [
      "Campanha para a primeira quinzena de janeiro",
      "Criativos com tema de renovação e fresh start",
      "Público: pessoas que mudaram recentemente, recém-casados",
      "Orçamento: R$ 25-40/dia",
      "Ofereça condição de 1ª parcela para fevereiro",
    ],
    hashtags: ["#AnoNovo", "#CasaNova", "#RenoveSuaCasa"],
  },
];
