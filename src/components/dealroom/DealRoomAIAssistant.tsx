/**
 * DealRoomAIAssistant — AI that reads chat, simulation, and video transcription
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Send, Lightbulb, RefreshCw, Mic, FileText,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";
import { getMIAOrchestrator } from "@/services/mia";

interface DealRoomAIAssistantProps {
  tenantId: string;
  clientName?: string;
  clientId?: string;
  proposalValue?: number;
  sessionId?: string;
  transcription?: Array<{ speaker: string; text: string; timestamp?: string }>;
}

interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  { label: "Argumentos de venda", prompt: "Me dê 5 argumentos de venda poderosos para convencer o cliente a fechar agora" },
  { label: "Responder objeção de preço", prompt: "O cliente acha que o preço está alto. Como devo responder?" },
  { label: "Técnica de urgência", prompt: "Sugira uma técnica de urgência para acelerar o fechamento" },
  { label: "Analisar conversa", prompt: "Analise toda a conversa do WhatsApp e da reunião. Quais objeções surgiram? Quais sinais de fechamento? O que devo fazer agora?" },
  { label: "Resumo da reunião", prompt: "Faça um resumo executivo da reunião até agora, destacando pontos-chave, objeções e próximos passos." },
];

export function DealRoomAIAssistant({ tenantId, clientName, clientId, proposalValue, sessionId, transcription }: DealRoomAIAssistantProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [chatContext, setChatContext] = useState("");
  const [simContext, setSimContext] = useState("");

  // Build context from WhatsApp chat + simulations
  const buildContext = useCallback(async () => {
    if (!clientId) return;
    let chatCtx = "";
    let simCtx = "";

    // Fetch WhatsApp messages
    const { data: tracking } = await supabase
      .from("client_tracking" as any)
      .select("id")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .limit(1);

    if (tracking && (tracking as any[]).length > 0) {
      const trackingId = (tracking as any[])[0].id;
      const { data: msgs } = await supabase
        .from("whatsapp_messages" as any)
        .select("sender, content, created_at")
        .eq("tracking_id", trackingId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (msgs && (msgs as any[]).length > 0) {
        chatCtx = "\n\n=== HISTÓRICO DO CHAT DE VENDAS (WhatsApp) ===\n" +
          (msgs as any[]).map((m: any) =>
            `[${m.sender === "me" ? "Vendedor" : "Cliente"}]: ${m.content}`
          ).join("\n");
      }
    }

    // Fetch simulations
    const { data: sims } = await supabase
      .from("simulations")
      .select("valor_tela, desconto1, desconto2, desconto3, forma_pagamento, parcelas, valor_final, created_at")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (sims && sims.length > 0) {
      simCtx = "\n\n=== SIMULAÇÕES DO CLIENTE ===\n" +
        sims.map((s: any, i: number) =>
          `Simulação ${i + 1}: Valor Tela ${formatCurrency(s.valor_tela || 0)}, ` +
          `Descontos: ${s.desconto1 || 0}%+${s.desconto2 || 0}%+${s.desconto3 || 0}%, ` +
          `Forma: ${s.forma_pagamento || "N/A"}, ${s.parcelas || 1}x, ` +
          `Valor Final: ${formatCurrency(s.valor_final || 0)}`
        ).join("\n");
    }

    setChatContext(chatCtx);
    setSimContext(simCtx);
    setContextLoaded(true);
  }, [clientId, tenantId]);

  useEffect(() => { buildContext(); }, [buildContext]);

  const getTranscriptionContext = () => {
    if (!transcription || transcription.length === 0) return "";
    return "\n\n=== TRANSCRIÇÃO DA REUNIÃO (em tempo real) ===\n" +
      transcription.map(e =>
        `[${e.speaker === "vendedor" ? "Vendedor" : "Cliente"}${e.timestamp ? ` ${e.timestamp}` : ""}]: ${e.text}`
      ).join("\n");
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: AIMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const transcriptionCtx = getTranscriptionContext();
      const fullContext = `Contexto: Estou em uma reunião de vendas na Deal Room.
Cliente: ${clientName || "não informado"}.
Valor da proposta: ${proposalValue ? formatCurrency(proposalValue) : "não definido"}.
Sou um projetista/vendedor de móveis planejados.${chatContext}${simContext}${transcriptionCtx}`;

      const mia = getMIAOrchestrator();
      const response = await mia.handleRequest({
        context: "dealroom",
        tenantId,
        useMemory: true,
        messages: [
          {
            role: "system",
            content: `Você é um assistente de vendas inteligente na Deal Room. Você tem acesso a TODO o histórico de conversa do WhatsApp, todas as simulações de orçamento e a transcrição da reunião por vídeo em tempo real. Use TODAS essas informações para dar conselhos precisos, identificar objeções, sinais de fechamento e sugerir ações. Seja direto e prático. ${fullContext}`,
          },
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: text },
        ],
      });

      if (response.error) throw new Error(response.error);
      const aiResponse = response.content || "Desculpe, não consegui gerar uma resposta.";
      setMessages(prev => [...prev, { role: "assistant", content: aiResponse }]);
    } catch {
      toast.error("Erro ao consultar IA");
      setMessages(prev => [...prev, { role: "assistant", content: "Erro de conexão com a IA. Tente novamente." }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Assistente de Negociação</h4>
        {contextLoaded && (
          <div className="flex gap-1 ml-auto">
            {chatContext && <Badge variant="outline" className="text-[8px] gap-0.5"><Mic className="h-2.5 w-2.5" /> Chat</Badge>}
            {simContext && <Badge variant="outline" className="text-[8px] gap-0.5"><FileText className="h-2.5 w-2.5" /> Sim</Badge>}
            {transcription && transcription.length > 0 && (
              <Badge variant="outline" className="text-[8px] gap-0.5 border-primary/50 text-primary"><Mic className="h-2.5 w-2.5" /> Vídeo</Badge>
            )}
          </div>
        )}
      </div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-1">
        {QUICK_PROMPTS.map(qp => (
          <Badge
            key={qp.label}
            variant="secondary"
            className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => sendMessage(qp.prompt)}
          >
            <Lightbulb className="h-2.5 w-2.5 mr-1" /> {qp.label}
          </Badge>
        ))}
      </div>

      {/* Messages */}
      <ScrollArea className="h-[280px] border rounded-lg">
        <div className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <Brain className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">
                A IA tem acesso ao chat de vendas, simulações e transcrição da reunião.
              </p>
              <p className="text-[10px] text-muted-foreground">
                Pergunte qualquer coisa sobre a negociação!
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1 mb-1">
                    <Brain className="h-3 w-3" />
                    <span className="text-[10px] font-medium opacity-70">IA</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Pergunte algo à IA..."
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={2}
          className="text-sm resize-none"
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
        />
        <Button size="icon" onClick={() => sendMessage(input)} disabled={loading || !input.trim()} className="self-end">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
