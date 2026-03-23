import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Send, Lightbulb, MessageSquare, RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";

interface DealRoomAIAssistantProps {
  tenantId: string;
  clientName?: string;
  proposalValue?: number;
}

interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  { label: "Argumentos de venda", prompt: "Me dê 5 argumentos de venda poderosos para convencer o cliente a fechar agora" },
  { label: "Responder objeção de preço", prompt: "O cliente acha que o preço está alto. Como devo responder?" },
  { label: "Técnica de urgência", prompt: "Sugira uma técnica de urgência para acelerar o fechamento" },
  { label: "Comparativo concorrência", prompt: "Como posso mostrar que nosso produto é melhor que a concorrência?" },
  { label: "Oferecer desconto", prompt: "Qual a melhor forma de oferecer um desconto sem desvalorizar o produto?" },
];

export function DealRoomAIAssistant({ tenantId, clientName, proposalValue }: DealRoomAIAssistantProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: AIMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const context = `Contexto: Estou em uma reunião de vendas na Deal Room.
Cliente: ${clientName || "não informado"}.
Valor da proposta: ${proposalValue ? formatCurrency(proposalValue) : "não definido"}.
Sou um projetista/vendedor de móveis planejados.`;

      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          messages: [
            { role: "system", content: `Você é um assistente de vendas especializado em negociação de móveis planejados. Ajude o vendedor com argumentos, técnicas de fechamento e respostas para objeções. Seja direto e prático. ${context}` },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: text },
          ],
          tenant_id: tenantId,
        },
      });

      if (error) throw error;

      const aiResponse = data?.reply || data?.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
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
                Use a IA para obter argumentos de venda, responder objeções e técnicas de fechamento.
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
