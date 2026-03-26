/**
 * VendaZap message generator tab - extracted from VendaZapPanel.tsx
 */
import { useState, useEffect, useCallback } from "react";
import { usePersistedFormState } from "@/hooks/usePersistedFormState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, Copy, Sparkles, MessageSquare, Clock, Target,
  RefreshCw, Zap, Send, Handshake, Lightbulb, ExternalLink, ShieldAlert, Flame, Download,
} from "lucide-react";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { calcLeadTemperature, TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import { ClosingThermometer, analyzeClientMessage } from "./ClosingThermometer";
import { NegotiationEvolutionPanel, learnFromMessage, learnGoodResponse, recordSession, buildLearningContext } from "./NegotiationLearning";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const COPY_TYPES = [
  { value: "reativacao", label: "Reativação", icon: RefreshCw, description: "Reengajar cliente inativo com urgência" },
  { value: "urgencia", label: "Urgência", icon: Clock, description: "Pressionar com prazo e escassez" },
  { value: "objecao", label: "Quebra de Objeção", icon: ShieldAlert, description: "Derrubar objeções com firmeza" },
  { value: "reuniao", label: "Convite Reunião", icon: Handshake, description: "Agendar encontro decisivo" },
  { value: "fechamento", label: "Fechamento", icon: Zap, description: "Fechar a venda AGORA" },
  { value: "reversao", label: "Reversão", icon: Flame, description: "Reverter desistência ou recusa" },
];

export { COPY_TYPES };

const TONES = [
  { value: "direto", label: "Direto e Assertivo" },
  { value: "consultivo", label: "Consultivo Expert" },
  { value: "persuasivo", label: "Persuasivo Closer" },
  { value: "urgente", label: "Urgente e Decisivo" },
];

function getClientScore(client: Client, diasSemResposta: number) {
  if (client.status === "fechado") return { label: "Fechado", emoji: "✅", color: "text-green-600" };
  const temp = calcLeadTemperature({ status: client.status, diasSemResposta, temSimulacao: true });
  const cfg = TEMPERATURE_CONFIG[temp];
  return { label: cfg.label, emoji: cfg.emoji, color: cfg.color };
}

export { getClientScore };

interface VendaZapGenerateTabProps {
  generating: boolean;
  generateMessage: (params: any) => Promise<string | null>;
  addon: any;
  autoSugg: any;
  currentUserId?: string;
}

interface HistoricoEntry {
  remetente_tipo: "cliente" | "ia";
  mensagem: string;
  intent?: string;
  score?: number;
}

export function VendaZapGenerateTab({ generating, generateMessage, addon, autoSugg, currentUserId }: VendaZapGenerateTabProps) {
  const [formState, updateForm, clearForm] = usePersistedFormState("vendazap-generate", {
    tipoCopy: "geral",
    tom: "persuasivo",
    mensagemCliente: "",
    mensagemGerada: "",
    selectedClientId: null as string | null,
    searchClient: "",
  });

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [lastSim, setLastSim] = useState<any>(null);
  const [closingScore, setClosingScore] = useState<number | null>(null);

  const [autoChanged, setAutoChanged] = useState<{ copy?: string; tone?: string }>({});

  // Conversation memory — persisted in sessionStorage
  const [historico, setHistorico] = usePersistedFormState("vendazap-historico", {
    entries: [] as HistoricoEntry[],
    clientId: null as string | null,
  });

  // Derived from persisted state
  const { tipoCopy, tom, mensagemCliente, mensagemGerada, searchClient } = formState;
  const setTipoCopy = useCallback((v: string) => updateForm({ tipoCopy: v }), [updateForm]);
  const setTom = useCallback((v: string) => updateForm({ tom: v }), [updateForm]);
  const setMensagemCliente = useCallback((v: string) => updateForm({ mensagemCliente: v }), [updateForm]);
  const setSearchClient = useCallback((v: string) => updateForm({ searchClient: v }), [updateForm]);

  // Analyze client message for thermometer + auto-select copy type
  const clientAnalysis = mensagemCliente ? analyzeClientMessage(mensagemCliente) : null;

  // Auto-detect and select appropriate copy type AND tone based on client message — real-time on every keystroke
  useEffect(() => {
    if (!mensagemCliente || mensagemCliente.trim().length < 3) return;
    const analysis = analyzeClientMessage(mensagemCliente);
    if (!analysis) return;
    const intentToCopy: Record<string, string> = {
      "fechamento": "fechamento",
      "orçamento": "urgencia",
      "negociação": "objecao",
      "dúvida": "reuniao",
      "objeção": "objecao",
      "resistência": "reversao",
      "enviar_preco": "reuniao",
      "saudação": "fechamento",
      "neutro": "urgencia",
    };
    const intentToTone: Record<string, string> = {
      "fechamento": "urgente",
      "orçamento": "consultivo",
      "negociação": "persuasivo",
      "dúvida": "consultivo",
      "objeção": "persuasivo",
      "resistência": "direto",
      "enviar_preco": "consultivo",
      "saudação": "consultivo",
      "neutro": "persuasivo",
    };
    const suggestedCopy = intentToCopy[analysis.intent];
    const suggestedTone = intentToTone[analysis.intent];
    if (suggestedCopy) { setTipoCopy(suggestedCopy); setAutoChanged(prev => ({ ...prev, copy: suggestedCopy })); }
    if (suggestedTone) { setTom(suggestedTone); setAutoChanged(prev => ({ ...prev, tone: suggestedTone })); }
    // Clear animation after 1.5s
    const timer = setTimeout(() => setAutoChanged({}), 1500);
    return () => clearTimeout(timer);
  }, [mensagemCliente]);

  useEffect(() => {
    const tenantId = getTenantId();
    let query = supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    query.then(({ data }) => {
      if (data) {
        setClients(data);
        if (formState.selectedClientId && !selectedClient) {
          const restored = data.find(c => c.id === formState.selectedClientId);
          if (restored) setSelectedClient(restored);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (selectedClient) {
      supabase.from("simulations").select("*").eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          setLastSim(data);
          if (addon?.ativo) autoSugg.generate(selectedClient, data);
        });
    } else {
      autoSugg.clear();
    }
  }, [selectedClient?.id]);

  const diasSemResposta = selectedClient ? Math.floor((Date.now() - new Date(selectedClient.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const clientScore = selectedClient ? getClientScore(selectedClient, diasSemResposta) : null;

  // Reset historico when client changes
  useEffect(() => {
    if (selectedClient && historico.clientId !== selectedClient.id) {
      setHistorico({ entries: [], clientId: selectedClient.id });
    }
  }, [selectedClient?.id]);

  const handleGenerate = async () => {
    // Build historico array from memory for the edge function
    const historicoPayload = historico.entries.map(e => ({
      remetente_tipo: e.remetente_tipo === "ia" ? "loja" : "cliente",
      mensagem: e.mensagem,
    }));

    // Include learning context for the AI
    const learningContext = buildLearningContext();

    const result = await generateMessage({
      nome_cliente: selectedClient?.nome, valor_orcamento: lastSim?.valor_final || lastSim?.valor_tela,
      status_negociacao: selectedClient?.status || "novo", dias_sem_resposta: diasSemResposta,
      mensagem_cliente: mensagemCliente || undefined, tipo_copy: tipoCopy, tom,
      client_id: selectedClient?.id, usuario_id: currentUserId,
      historico: historicoPayload.length > 0 ? historicoPayload : undefined,
      learning_context: learningContext || undefined,
    });
    if (result) {
      updateForm({ mensagemGerada: result });

      // Add to conversation memory + learn from this interaction
      const newEntries = [...historico.entries];
      if (mensagemCliente?.trim()) {
        const analysis = analyzeClientMessage(mensagemCliente);
        newEntries.push({ remetente_tipo: "cliente", mensagem: mensagemCliente.trim(), intent: analysis.intent, score: analysis.score });
        // Teach the learning engine
        learnFromMessage(analysis.intent, mensagemCliente.trim(), analysis.score);
      }
      newEntries.push({ remetente_tipo: "ia", mensagem: result });
      setHistorico({ entries: newEntries.slice(-20), clientId: selectedClient?.id || null });

      // Calculate closing score
      const baseScore = clientAnalysis ? clientAnalysis.score : 50;
      const copyBonus = tipoCopy === "fechamento" ? 20 : tipoCopy === "urgencia" ? 15 : tipoCopy === "objecao" ? 10 : tipoCopy === "reversao" ? 5 : 0;
      setClosingScore(Math.min(100, baseScore + copyBonus + 15));

      // Clear client message field for next round
      updateForm({ mensagemCliente: "" });
    }
  };

  // Learn when user copies a generated message (signals it was good)
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada!");
    // Record as good response
    if (mensagemGerada && clientAnalysis) {
      learnGoodResponse(clientAnalysis.intent, formState.mensagemCliente || "", text);
    }
  };

  const handleCopyAndOpenWhatsApp = (text: string, phone?: string | null) => {
    navigator.clipboard.writeText(text);
    const cleanPhone = phone?.replace(/\D/g, "") || "";
    const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
    toast.success("Mensagem copiada e WhatsApp aberto!");
  };

  const handleExportPDF = () => {
    if (historico.entries.length === 0) {
      toast.error("Nenhuma conversa na memória para exportar.");
      return;
    }
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    const checkPage = (needed: number) => { if (y + needed > 275) { doc.addPage(); y = 20; } };

    const addText = (text: string, x: number, fontSize: number, color: [number, number, number], bold = false) => {
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, maxWidth - (x - margin));
      for (const line of lines) {
        checkPage(fontSize * 0.5 + 2);
        doc.text(line, x, y);
        y += fontSize * 0.5;
      }
    };

    addText("Relatório de Análise de Conversação — VendaZap AI", margin, 14, [0, 100, 60], true);
    y += 4;
    addText(`Cliente: ${selectedClient?.nome || "Não selecionado"}`, margin, 10, [60, 60, 60]);
    addText(`Data: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}`, margin, 10, [60, 60, 60]);
    addText(`Total de interações: ${historico.entries.length}`, margin, 10, [60, 60, 60]);
    y += 6;
    doc.setDrawColor(0, 150, 80);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    historico.entries.forEach((entry, i) => {
      checkPage(20);
      const isIA = entry.remetente_tipo === "ia";
      const label = isIA ? "Resposta da IA" : "Mensagem do Cliente";
      const intentLabel = entry.intent ? ` (Intencao: ${entry.intent})` : "";
      const scoreLabel = entry.score !== undefined ? ` - Score: ${entry.score}%` : "";

      addText(`${i + 1}. ${label}${intentLabel}${scoreLabel}`, margin, 9, isIA ? [0, 100, 60] : [180, 80, 0], true);
      y += 1;

      const msgLines = doc.splitTextToSize(entry.mensagem, maxWidth - 10);
      const blockHeight = msgLines.length * 4.5 + 6;
      checkPage(blockHeight + 4);

      doc.setFillColor(isIA ? 240 : 255, isIA ? 250 : 245, isIA ? 245 : 235);
      doc.roundedRect(margin, y - 2, maxWidth, blockHeight, 2, 2, "F");

      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
      for (const line of msgLines) {
        doc.text(line, margin + 5, y + 3);
        y += 4.5;
      }
      y += 6;
    });

    checkPage(30);
    y += 4;
    doc.setDrawColor(0, 150, 80);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    addText("Analise de Pontos de Falha", margin, 12, [0, 0, 0], true);
    y += 2;

    const objections = historico.entries.filter(e => e.remetente_tipo === "cliente" && (e.intent === "objecao" || e.intent === "resistencia"));
    if (objections.length > 0) {
      addText(`${objections.length} objecao(oes) detectada(s):`, margin, 9, [180, 80, 0], true);
      objections.forEach((obj, idx) => {
        addText(`  ${idx + 1}. "${obj.mensagem.substring(0, 100)}..." - Intencao: ${obj.intent} (${obj.score}%)`, margin + 5, 8, [100, 60, 0]);
      });
      y += 2;
    } else {
      addText("Nenhuma objecao critica detectada.", margin, 9, [0, 120, 60]);
    }

    const scored = historico.entries.filter(e => e.score !== undefined);
    const avgScore = scored.length > 0 ? scored.reduce((sum, e) => sum + (e.score || 0), 0) / scored.length : 0;
    addText(`Score medio de fechamento: ${Math.round(avgScore)}%`, margin, 9, [0, 0, 0]);

    const trend = historico.entries.filter(e => e.remetente_tipo === "cliente" && e.score !== undefined);
    if (trend.length >= 2) {
      const first = trend[0].score || 0;
      const last = trend[trend.length - 1].score || 0;
      const dir = last > first ? "Tendencia positiva" : last < first ? "Tendencia negativa" : "Estavel";
      addText(`${dir}: de ${first}% para ${last}%`, margin, 9, last >= first ? [0, 120, 60] : [200, 50, 0]);
    }

    // === AI Improvement Suggestions ===
    checkPage(40);
    y += 6;
    doc.setDrawColor(0, 100, 180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    addText("Sugestoes da IA para Melhorar a Abordagem", margin, 12, [0, 80, 160], true);
    y += 4;

    const improvementTips: string[] = [];

    const priceObj = objections.filter(o => /caro|preco|valor|desconto|barato/i.test(o.mensagem));
    const thinkObj = objections.filter(o => /pensar|depois|calma|ver/i.test(o.mensagem));
    const competitorObj = objections.filter(o => /concorr|outro lugar|outra loja/i.test(o.mensagem));
    const rejectObj = objections.filter(o => /nao quero|desist|cancel/i.test(o.mensagem));

    if (priceObj.length > 0) {
      improvementTips.push("PRECO/VALOR: O cliente questionou preco " + priceObj.length + " vez(es). Sugestao: Apresente o ROI do investimento, compare com o custo de nao ter o produto, ofereça condicoes de pagamento diferenciadas ANTES da objecao surgir.");
    }
    if (thinkObj.length > 0) {
      improvementTips.push("INDECISAO: O cliente pediu tempo " + thinkObj.length + " vez(es). Sugestao: Antecipe criando urgencia real (prazo de validade, disponibilidade limitada). Pergunte 'O que falta para decidirmos agora?'");
    }
    if (competitorObj.length > 0) {
      improvementTips.push("CONCORRENCIA: Mencionou concorrentes " + competitorObj.length + " vez(es). Sugestao: Prepare comparativo de diferenciais exclusivos. Destaque garantias, pos-venda e personalizacao.");
    }
    if (rejectObj.length > 0) {
      improvementTips.push("REJEICAO DIRETA: Houve " + rejectObj.length + " tentativa(s) de desistencia. Sugestao: Identifique o motivo REAL. Use perguntas abertas e ofereça algo exclusivo e limitado.");
    }
    if (avgScore < 30) {
      improvementTips.push("SCORE BAIXO (media " + Math.round(avgScore) + "%): Qualifique melhor o lead antes de iniciar a venda. Leads frios precisam de aquecimento com conteudo de valor antes da oferta.");
    } else if (avgScore < 50) {
      improvementTips.push("SCORE MEDIO (media " + Math.round(avgScore) + "%): Aumente a frequencia de CTAs diretos. Cada mensagem deve ter uma acao clara.");
    }
    if (trend.length >= 2) {
      const f = trend[0].score || 0;
      const l = trend[trend.length - 1].score || 0;
      if (l < f) {
        improvementTips.push("TENDENCIA NEGATIVA: Interesse caiu de " + f + "% para " + l + "%. Mude a abordagem — se usou logica, use emocao. A repeticao da mesma estrategia em queda so acelera a perda.");
      }
    }
    if (historico.entries.filter(e => e.remetente_tipo === "ia").length > 4 && avgScore < 60) {
      improvementTips.push("MUITAS MENSAGENS SEM AVANCO: Considere contato presencial (ligacao, video-chamada, visita). Negociacoes longas por texto tendem a esfriar.");
    }
    if (improvementTips.length === 0) {
      improvementTips.push("Negociacao bem conduzida! Mantenha a assertividade e continue evoluindo a argumentacao a cada interacao.");
    }

    improvementTips.forEach((tip, idx) => {
      const tipLines = doc.splitTextToSize(`${idx + 1}. ${tip}`, maxWidth - 10);
      const blockH = tipLines.length * 4.5 + 6;
      checkPage(blockH + 4);
      doc.setFillColor(235, 245, 255);
      doc.roundedRect(margin, y - 2, maxWidth, blockH, 2, 2, "F");
      doc.setFontSize(8);
      doc.setTextColor(0, 60, 120);
      doc.setFont("helvetica", "normal");
      for (const line of tipLines) {
        doc.text(line, margin + 5, y + 3);
        y += 4.5;
      }
      y += 6;
    });

    doc.save(`conversacao-${selectedClient?.nome?.replace(/\s+/g, "_") || "cliente"}-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exportado com sucesso!");
  };

  const filteredClients = clients.filter(c =>
    c.nome.toLowerCase().includes(searchClient.toLowerCase()) ||
    c.numero_orcamento?.toLowerCase().includes(searchClient.toLowerCase())
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-4">
        {/* Client Selection */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buscar cliente por nome ou orçamento..." value={searchClient} onChange={(e) => setSearchClient(e.target.value)} />
            {searchClient && !selectedClient && (
              <ScrollArea className="h-32 border rounded-md">
                {filteredClients.slice(0, 8).map(c => {
                  const days = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                  const score = getClientScore(c, days);
                  return (
                    <button key={c.id} onClick={() => { setSelectedClient(c); updateForm({ selectedClientId: c.id, searchClient: "", mensagemGerada: "" }); setClosingScore(null); }}
                      className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors text-sm flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground">{c.nome}</span>
                        {c.numero_orcamento && <span className="text-muted-foreground ml-2">#{c.numero_orcamento}</span>}
                      </div>
                      <span className="text-xs">{score.emoji} {score.label}</span>
                    </button>
                  );
                })}
              </ScrollArea>
            )}
            {selectedClient && (
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground">{selectedClient.nome}</p>
                    {clientScore && <Badge variant="outline" className={`text-[10px] ${clientScore.color}`}>{clientScore.emoji} {clientScore.label}</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => {
                    // Record session before clearing
                    if (historico.entries.length > 0) {
                      const scores = historico.entries.filter(e => e.score !== undefined).map(e => e.score || 0);
                      recordSession({
                        clientId: selectedClient?.id || null,
                        clientName: selectedClient?.nome || "",
                        date: new Date().toISOString(),
                        totalMessages: historico.entries.length,
                        avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
                        finalScore: scores[scores.length - 1] || 0,
                        objections: historico.entries.filter(e => e.intent === "objeção" || e.intent === "resistência").map(e => e.mensagem),
                        outcome: "concluida",
                      });
                    }
                    setSelectedClient(null); updateForm({ selectedClientId: null, mensagemGerada: "" }); autoSugg.clear(); setClosingScore(null); setHistorico({ entries: [], clientId: null });
                  }} className="h-6 text-xs">Trocar</Button>
                </div>
                {selectedClient.numero_orcamento && <p className="text-xs text-muted-foreground">Orçamento: #{selectedClient.numero_orcamento}</p>}
                <p className="text-xs text-muted-foreground">Status: {selectedClient.status}</p>
                {lastSim?.valor_final && <p className="text-xs text-muted-foreground">Valor: R$ {Number(lastSim.valor_final).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
                {diasSemResposta > 0 && <p className="text-xs text-orange-600">{diasSemResposta} dias sem atualização</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto Suggestion */}
        {selectedClient && (autoSugg.suggestion || autoSugg.loading) && (
          <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" />💡 Sugestão da IA</CardTitle>
            </CardHeader>
            <CardContent>
              {autoSugg.loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" />Analisando...</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{autoSugg.suggestion}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { updateForm({ mensagemGerada: autoSugg.suggestion }); if (selectedClient) autoSugg.markUsed(selectedClient.id); toast.success("Sugestão aplicada!"); }}>
                      <Sparkles className="h-3 w-3" />Usar resposta
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleCopy(autoSugg.suggestion)}><Copy className="h-3 w-3" />Copiar</Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleCopyAndOpenWhatsApp(autoSugg.suggestion, selectedClient?.telefone1)}><ExternalLink className="h-3 w-3" />WhatsApp</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Copy Type */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Tipo de Mensagem</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {COPY_TYPES.map(ct => {
                const Icon = ct.icon;
                const isSelected = tipoCopy === ct.value;
                const justAutoSelected = autoChanged.copy === ct.value;
                return (
                  <button key={ct.value} onClick={() => { setTipoCopy(ct.value); setAutoChanged(prev => ({ ...prev, copy: undefined })); }}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all duration-500 ease-out ${
                      isSelected
                        ? `border-primary bg-primary/15 ring-2 ring-primary/30 shadow-md shadow-primary/10 scale-[1.02] ${justAutoSelected ? "animate-scale-in" : ""}`
                        : "border-border hover:border-muted-foreground/30 bg-background"
                    }`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 shrink-0 transition-colors duration-300 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium transition-colors duration-300 ${isSelected ? "text-primary" : "text-foreground"}`}>{ct.label}</span>
                      {isSelected && clientAnalysis && <Badge className="text-[8px] h-4 bg-primary/20 text-primary border-0 ml-auto animate-fade-in">Auto</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{ct.description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tone */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Tom da Mensagem
              {clientAnalysis && mensagemCliente.length > 3 && (
                <Badge className="text-[8px] h-4 bg-primary/20 text-primary border-0">Auto</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <button key={t.value} onClick={() => setTom(t.value)}
                  className={`p-2 rounded-lg border-2 text-left transition-all duration-300 ${
                    tom === t.value
                      ? "border-primary bg-primary/15 ring-2 ring-primary/30 shadow-md shadow-primary/10 scale-[1.02]"
                      : "border-border hover:border-muted-foreground/30 bg-background"
                  }`}>
                  <span className={`text-xs font-medium ${tom === t.value ? "text-primary" : "text-foreground"}`}>{t.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conversation History */}
        {historico.entries.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Memória da Conversa ({historico.entries.length} msgs)
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-primary" onClick={handleExportPDF}>
                    <Download className="h-3 w-3" />PDF
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setHistorico({ entries: [], clientId: selectedClient?.id || null })}>
                    Limpar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-48 overflow-y-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <style>{`.scrollbar-none::-webkit-scrollbar { display: none; }`}</style>
                <div className="space-y-1.5">
                  {historico.entries.map((entry, i) => (
                    <div key={i} className={`flex ${entry.remetente_tipo === "ia" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                        entry.remetente_tipo === "ia"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-foreground"
                      }`}>
                        <span className="font-semibold text-[10px] block mb-0.5">
                          {entry.remetente_tipo === "ia" ? "🤖 IA" : "👤 Cliente"}
                          {entry.intent && <span className="ml-1 opacity-70">({entry.intent})</span>}
                        </span>
                        <p>{entry.mensagem}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Client Message */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {historico.entries.length > 0 ? "Réplica do Cliente" : "Mensagem do Cliente (opcional)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={historico.entries.length > 0
                ? "Cole a réplica do cliente — a IA usará todo o contexto anterior para contra-argumentar..."
                : "Cole aqui a mensagem do cliente para a IA analisar e contra-argumentar..."
              }
              value={mensagemCliente}
              onChange={(e) => setMensagemCliente(e.target.value)}
              rows={3}
            />
            {clientAnalysis && mensagemCliente.length > 3 && (
              <ClosingThermometer score={clientAnalysis.score} label={`Análise da mensagem do cliente — Intenção: ${clientAnalysis.intent}`} />
            )}
          </CardContent>
        </Card>

        <Button onClick={handleGenerate} disabled={generating} className="w-full gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" size="lg">
          {generating ? <><RefreshCw className="h-4 w-4 animate-spin" />Gerando...</> : <><Sparkles className="h-4 w-4" />Gerar Mensagem de Fechamento</>}
        </Button>
      </div>

      {/* Result */}
      <div className="space-y-4">
        {/* Evolution panel */}
        <NegotiationEvolutionPanel currentEntries={historico.entries} />

        {/* Response thermometer */}
        {closingScore !== null && mensagemGerada && (
          <ClosingThermometer score={closingScore} label="Potencial de fechamento da resposta" />
        )}

        <Card className="min-h-[300px]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-green-600" />Mensagem Gerada</CardTitle>
              <div className="flex items-center gap-2">
                {closingScore !== null && <ClosingThermometer score={closingScore} compact />}
                {mensagemGerada && <Button variant="outline" size="sm" onClick={() => handleCopy(mensagemGerada)} className="gap-1 h-7"><Copy className="h-3 w-3" />Copiar</Button>}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {mensagemGerada ? (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-4 relative">
                <div className="absolute -top-2 -left-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"><MessageSquare className="h-3 w-3 text-white" /></div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{mensagemGerada}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bot className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm text-center">Selecione um cliente e tipo de mensagem, depois clique em "Gerar Mensagem de Fechamento"</p>
              </div>
            )}
          </CardContent>
        </Card>

        {mensagemGerada && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerate} disabled={generating} className="flex-1 gap-2"><RefreshCw className="h-4 w-4" />Regenerar</Button>
              <Button variant="outline" onClick={() => handleCopy(mensagemGerada)} className="flex-1 gap-2"><Copy className="h-4 w-4" />Copiar</Button>
            </div>
            <Button onClick={() => handleCopyAndOpenWhatsApp(mensagemGerada, selectedClient?.telefone1)} className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
              <ExternalLink className="h-4 w-4" />Copiar + Abrir WhatsApp
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
