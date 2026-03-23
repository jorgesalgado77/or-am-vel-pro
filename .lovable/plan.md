

## Auditoria Completa do Deal Room — Implementado vs. Pendente

### O que foi implementado (✅)

1. **Gestão de Propostas Comerciais** — Criar, listar, acompanhar status (Enviada → Visualizada → Aceita → Paga → Recusada)
2. **KPIs e Métricas** — Cards com total de propostas, vendas, valor transacionado, taxa plataforma, ticket médio
3. **Ranking de Vendedores** — Top vendedores ordenados por valor vendido
4. **Funil de Propostas (Métricas)** — Contagem por status (enviadas, visualizadas, aceitas, pagas, recusadas)
5. **Integração Stripe** — Checkout para pagamento via cartão (Edge Function `dealroom`)
6. **Validação de Acesso** — Verificação de plano/recursos VIP para habilitar Deal Room
7. **Registro de Transações** — Tabela `dealroom_transactions` com cálculo de taxa 2.5%
8. **Card de Comissões Deal Room no Admin** — Valor acumulado de comissões no painel administrativo
9. **Controle de Uso Diário** — Tabela `dealroom_usage` para limitar uso por plano

### O que está PENDENTE (❌) — Visão completa do usuário

| # | Funcionalidade | Descrição |
|---|---|---|
| 1 | **Sala de Reunião por Vídeo** | Videoconferência incorporada (WebRTC/Daily.co/Jitsi) com câmera, áudio, compartilhamento de tela |
| 2 | **Controles de Reunião** | Botões de mudo, ligar/desligar câmera, barra de volume deslizante, tela cheia |
| 3 | **Gravação da Reunião** | Opção de gravar a sessão de vídeo |
| 4 | **Tela de Simulação Incorporada** | Exibir simulação de venda em tempo real dentro da sala, editável durante a reunião |
| 5 | **Agente de IA na Negociação** | Assistente IA incorporado na sala para sugerir argumentos, responder objeções, auxiliar na negociação |
| 6 | **Campos para Contrato** | Formulário para preencher dados do contrato durante a reunião |
| 7 | **Assinatura Digital** | Captura de assinatura eletrônica do cliente na sala |
| 8 | **Tela de Pagamentos Completa** | Opções de PIX (QR code), cartão de crédito, e upload de boletos PDF das financeiras |
| 9 | **Envio/Recebimento de Anexos** | Troca de arquivos entre projetista e cliente (imagens, PDF, Word, Excel, PowerPoint, etc.) com lista de miniaturas |
| 10 | **Link Único de Acesso** | Geração de URL exclusiva para o cliente entrar na sala sem login |
| 11 | **Acesso aos Dados do Cliente** | Botão para consultar todos os dados cadastrados do cliente durante a reunião |
| 12 | **Agendamento de Reuniões** | Calendário para agendar abertura de salas com notificação |
| 13 | **Integração VendaZap AI** | Conectar o Deal Room ao chat VendaZap para iniciar reuniões diretamente da conversa |
| 14 | **Integração Chat de Vendas** | Conectar com o sistema de chat de vendas existente |

### Plano de Implementação

Dado o escopo massivo (videoconferência, WebRTC, gravação, etc.), a implementação será dividida em **fases**:

**Fase 1 — Sala de Reunião Base** (prioridade alta)
- Componente `DealRoomMeeting.tsx` com integração Jitsi Meet (iframe, sem servidor próprio)
- Controles: mudo, câmera, volume, tela cheia
- Geração de link único por proposta/cliente
- Botão "Iniciar Sala" no widget existente

**Fase 2 — Conteúdo da Sala**
- Painel lateral com simulação incorporada (reutilizar `SimulatorPanel`)
- Campos de contrato editáveis em tempo real
- Agente IA (reutilizar engine do VendaZap AI) com sugestões contextuais
- Botão para ver dados completos do cliente

**Fase 3 — Anexos e Documentos**
- Upload/download bidirecional (projetista ↔ cliente) usando Supabase Storage
- Lista com preview em miniatura (imagens, PDF, Office)
- Upload de boletos PDF das financeiras

**Fase 4 — Pagamentos e Assinatura**
- Tela de pagamentos: PIX (QR code), cartão (Stripe), anexo de boletos
- Assinatura digital com canvas de desenho
- Geração automática do contrato assinado em PDF

**Fase 5 — Agendamento e Integrações**
- Calendário de agendamento de reuniões
- Integração com VendaZap AI (botão "Abrir Sala" no chat)
- Gravação de reunião (depende do provedor de vídeo)

### Considerações Técnicas

- **Vídeo**: Jitsi Meet (gratuito, open-source) via iframe é a opção mais viável sem servidor dedicado. Daily.co ou Twilio Video são alternativas pagas com mais controle.
- **Assinatura Digital**: Canvas HTML5 com `signature_pad` library
- **Anexos**: Bucket Supabase `dealroom-attachments` com RLS por tenant
- **Link do Cliente**: Token JWT temporário ou UUID único na tabela `dealroom_sessions`
- **IA**: Reutilizar a Edge Function `vendazap-ai` com prompt contextual para negociação

### Arquivos a criar/editar

- Criar `src/components/dealroom/DealRoomMeeting.tsx` — Sala principal
- Criar `src/components/dealroom/DealRoomControls.tsx` — Botões de mídia
- Criar `src/components/dealroom/DealRoomChat.tsx` — Chat interno da sala
- Criar `src/components/dealroom/DealRoomAttachments.tsx` — Painel de anexos
- Criar `src/components/dealroom/DealRoomPayments.tsx` — Tela de pagamentos
- Criar `src/components/dealroom/DealRoomSignature.tsx` — Assinatura digital
- Criar `src/components/dealroom/DealRoomScheduler.tsx` — Agendamento
- Criar `src/components/dealroom/DealRoomAIAssistant.tsx` — Agente IA
- Editar `src/components/DealRoomStoreWidget.tsx` — Adicionar botão "Iniciar Sala"
- Editar `src/components/chat/VendaZapChat.tsx` — Botão de integração
- Criar migrações SQL para `dealroom_sessions`, `dealroom_attachments`
- Criar bucket Storage `dealroom-attachments`

