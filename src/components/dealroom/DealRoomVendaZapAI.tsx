/**
 * VendaZap AI integration inside Deal Room — real-time audio transcription,
 * voice separation (Vendedor vs Cliente), AI sales coaching, and PDF export.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mic, MicOff, Brain, Send, Download, RefreshCw, Sparkles,
  MessageSquare, Copy, User, Headphones, StopCircle, Play,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { ClosingThermometer, analyzeClientMessage } from "@/components/vendazap/ClosingThermometer";
import { NegotiationEvolutionPanel, learnFromMessage, buildLearningContext } from "@/components/vendazap/NegotiationLearning";
import { COPY_TYPES } from "@/components/vendazap/VendaZapGenerateTab";

interface Props {
  tenantId: string;
  clientName?: string;
  proposalValue?: number;
  sessionId?: string;
}

interface TranscriptEntry {
  id: string;
  speaker: "vendedor" | "cliente";
  text: string;
  timestamp: Date;
  intent?: string;
  score?: number;
}

interface AICoachMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function DealRoomVendaZapAI({ tenantId, clientName, proposalValue, sessionId }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<"vendedor" | "cliente">("vendedor");
  const [aiCoachMessages, setAICoachMessages] = useState<AICoachMessage[]>([]);
  const [aiInput, setAIInput] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState("");
  const [generating, setGenerating] = useState(false);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const interimRef = useRef("");

  // Current analysis from latest client message
  const lastClientMsg = [...transcript].reverse().find(t => t.speaker === "cliente");
  const clientAnalysis = lastClientMsg ? analyzeClientMessage(lastClientMsg.text) : null;

  // Start/stop speech recognition
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      interimRef.current = interimText;

      if (finalText.trim()) {
        const analysis = analyzeClientMessage(finalText.trim());
        const entry: TranscriptEntry = {
          id: crypto.randomUUID(),
          speaker: currentSpeaker,
          text: finalText.trim(),
          timestamp: new Date(),
          intent: currentSpeaker === "cliente" ? analysis.intent : undefined,
          score: currentSpeaker === "cliente" ? analysis.score : undefined,
        };
        setTranscript(prev => [...prev, entry]);

        if (currentSpeaker === "cliente") {
          learnFromMessage(analysis.intent, finalText.trim(), analysis.score);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
        toast.error("Erro no reconhecimento de voz");
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording
      if (isRecording && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    toast.success("🎙️ Gravação iniciada!");
  }, [isRecording, currentSpeaker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  // Generate AI sales response based on conversation context
  const handleGenerateResponse = async () => {
    const recentClientMsgs = transcript.filter(t => t.speaker === "cliente").slice(-5);
    if (recentClientMsgs.length === 0) {
      toast.error("Nenhuma fala do cliente detectada ainda.");
      return;
    }

    setGenerating(true);
    const learningContext = buildLearningContext();
    const historico = transcript.slice(-10).map(t => ({
      remetente_tipo: t.speaker === "vendedor" ? "loja" : "cliente",
      mensagem: t.text,
    }));

    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          nome_cliente: clientName || "Cliente",
          valor_orcamento: proposalValue,
          status_negociacao: "em_negociacao",
          mensagem_cliente: recentClientMsgs[recentClientMsgs.length - 1].text,
          tipo_copy: "fechamento",
          tom: "persuasivo",
          historico,
          learning_context: learningContext || undefined,
        },
      });

      if (error) throw error;
      setGeneratedResponse(data?.mensagem || "");
    } catch {
      toast.error("Erro ao gerar resposta da IA");
    }
    setGenerating(false);
  };

  // AI Coach — ask strategy questions
  const sendCoachMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: AICoachMessage = { role: "user", content: text, timestamp: new Date() };
    setAICoachMessages(prev => [...prev, userMsg]);
    setAIInput("");
    setAILoading(true);

    try {
      const transcriptContext = transcript.slice(-15).map(t =>
        `${t.speaker === "vendedor" ? "Vendedor" : "Cliente"}: ${t.text}`
      ).join("\n");

      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          messages: [
            {
              role: "system",
              content: `Você é um coach de vendas de ELITE dentro de uma reunião ao vivo na Deal Room.
Contexto: Vendedor está em reunião com ${clientName || "cliente"}.
${proposalValue ? `Valor da proposta: R$ ${proposalValue}` : ""}

TRANSCRIÇÃO DA REUNIÃO ATÉ AGORA:
${transcriptContext || "(nenhuma fala capturada)"}

Ajude o vendedor com estratégias, argumentos e técnicas de fechamento em tempo real. Seja direto e assertivo.`
            },
            ...aiCoachMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
            { role: "user", content: text },
          ],
          tenant_id: tenantId,
        },
      });

      if (error) throw error;
      const reply = data?.reply || "Erro ao obter resposta.";
      setAICoachMessages(prev => [...prev, { role: "assistant", content: reply, timestamp: new Date() }]);
    } catch {
      toast.error("Erro na IA");
    }
    setAILoading(false);
  };

  // Export entire meeting transcript + analysis as PDF
  const handleExportPDF = () => {
    if (transcript.length === 0) {
      toast.error("Nenhuma transcrição para exportar.");
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

    // Header
    addText("Relatorio de Reuniao — Deal Room + VendaZap AI", margin, 14, [0, 100, 60], true);
    y += 4;
    addText(`Cliente: ${clientName || "Nao informado"}`, margin, 10, [60, 60, 60]);
    if (proposalValue) addText(`Valor da proposta: R$ ${proposalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, margin, 10, [60, 60, 60]);
    addText(`Data: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}`, margin, 10, [60, 60, 60]);
    addText(`Total de falas: ${transcript.length}`, margin, 10, [60, 60, 60]);
    y += 6;

    doc.setDrawColor(0, 150, 80);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Transcript
    addText("Transcricao Completa da Reuniao", margin, 12, [0, 0, 0], true);
    y += 4;

    transcript.forEach((entry, i) => {
      checkPage(20);
      const isVendedor = entry.speaker === "vendedor";
      const speakerLabel = isVendedor ? "Vendedor/Projetista" : "Cliente";
      const time = entry.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const intentLabel = entry.intent ? ` [${entry.intent}]` : "";
      const scoreLabel = entry.score !== undefined ? ` (${entry.score}%)` : "";

      addText(`${time} — ${speakerLabel}${intentLabel}${scoreLabel}`, margin, 8, isVendedor ? [0, 100, 60] : [180, 80, 0], true);
      y += 1;

      const msgLines = doc.splitTextToSize(entry.text, maxWidth - 10);
      const blockHeight = msgLines.length * 4.5 + 6;
      checkPage(blockHeight + 4);

      doc.setFillColor(isVendedor ? 240 : 255, isVendedor ? 250 : 245, isVendedor ? 245 : 235);
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

    // Failure analysis
    checkPage(30);
    y += 4;
    doc.setDrawColor(0, 100, 180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    addText("Analise de Pontos de Falha", margin, 12, [0, 80, 160], true);
    y += 4;

    const clientEntries = transcript.filter(t => t.speaker === "cliente");
    const objections = clientEntries.filter(t => t.intent === "objeção" || t.intent === "resistência" || t.intent === "enviar_preco");

    if (objections.length > 0) {
      addText(`${objections.length} ponto(s) critico(s) detectado(s):`, margin, 9, [180, 80, 0], true);
      y += 2;
      objections.forEach((obj, idx) => {
        addText(`${idx + 1}. [${obj.intent}] "${obj.text.substring(0, 120)}..." (Score: ${obj.score ?? "N/A"}%)`, margin + 5, 8, [100, 60, 0]);
      });
    } else {
      addText("Nenhuma objecao critica detectada.", margin, 9, [0, 120, 60]);
    }

    // Scores
    y += 4;
    const scored = clientEntries.filter(t => t.score !== undefined);
    const avgScore = scored.length > 0 ? scored.reduce((sum, t) => sum + (t.score || 0), 0) / scored.length : 0;
    addText(`Score medio de fechamento: ${Math.round(avgScore)}%`, margin, 9, [0, 0, 0]);

    // AI suggestions
    checkPage(30);
    y += 6;
    doc.setDrawColor(0, 100, 180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    addText("Sugestoes da IA para Melhorar", margin, 12, [0, 80, 160], true);
    y += 4;

    const tips: string[] = [];
    const priceObj = objections.filter(o => /caro|preco|valor|desconto/i.test(o.text));
    const thinkObj = objections.filter(o => /pensar|depois|calma/i.test(o.text));
    const sendPriceObj = objections.filter(o => o.intent === "enviar_preco");

    if (priceObj.length > 0) tips.push(`PRECO: Cliente questionou preco ${priceObj.length}x. Apresente ROI e compare com custo de nao ter o produto.`);
    if (thinkObj.length > 0) tips.push(`INDECISAO: Cliente pediu tempo ${thinkObj.length}x. Crie urgencia real e pergunte 'O que falta para decidirmos agora?'`);
    if (sendPriceObj.length > 0) tips.push(`ENVIO DE PRECO: Cliente pediu valor por mensagem ${sendPriceObj.length}x. NUNCA envie — sempre contorne com a Deal Room.`);
    if (avgScore < 40) tips.push(`SCORE BAIXO (${Math.round(avgScore)}%): Qualifique melhor antes de entrar em preco.`);
    if (tips.length === 0) tips.push("Reuniao bem conduzida! Mantenha a assertividade.");

    tips.forEach((tip, idx) => {
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

    doc.save(`reuniao-dealroom-${clientName?.replace(/\s+/g, "_") || "cliente"}-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF da reunião exportado!");
  };

  return (
    <div className="space-y-4">
      {/* Recording Controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Transcrição ao Vivo
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isRecording ? "destructive" : "default"}
                className="gap-1.5 h-7 text-xs"
                onClick={toggleRecording}
              >
                {isRecording ? (
                  <><StopCircle className="h-3 w-3" /> Parar</>
                ) : (
                  <><Play className="h-3 w-3" /> Gravar</>
                )}
              </Button>
              {transcript.length > 0 && (
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={handleExportPDF}>
                  <Download className="h-3 w-3" /> PDF
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Speaker toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Quem fala:</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={currentSpeaker === "vendedor" ? "default" : "outline"}
                className="h-6 text-[10px] gap-1"
                onClick={() => setCurrentSpeaker("vendedor")}
              >
                <User className="h-3 w-3" /> Vendedor
              </Button>
              <Button
                size="sm"
                variant={currentSpeaker === "cliente" ? "default" : "outline"}
                className="h-6 text-[10px] gap-1"
                onClick={() => setCurrentSpeaker("cliente")}
              >
                <Headphones className="h-3 w-3" /> Cliente
              </Button>
            </div>
            {isRecording && (
              <Badge variant="destructive" className="text-[9px] h-5 animate-pulse gap-1">
                <Mic className="h-2.5 w-2.5" /> REC
              </Badge>
            )}
          </div>

          {/* Transcript area */}
          <div
            ref={scrollRef}
            className="h-48 overflow-y-auto border rounded-lg p-2 space-y-1.5"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <style>{`.dealroom-transcript::-webkit-scrollbar { display: none; }`}</style>
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Mic className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">Clique em Gravar para iniciar a transcrição</p>
              </div>
            ) : (
              transcript.map(entry => (
                <div key={entry.id} className={`flex ${entry.speaker === "vendedor" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                    entry.speaker === "vendedor"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-foreground"
                  }`}>
                    <div className="flex items-center gap-1 mb-0.5">
                      {entry.speaker === "vendedor" ? (
                        <User className="h-2.5 w-2.5" />
                      ) : (
                        <Headphones className="h-2.5 w-2.5" />
                      )}
                      <span className="font-semibold text-[9px]">
                        {entry.speaker === "vendedor" ? "Vendedor" : "Cliente"}
                      </span>
                      {entry.intent && (
                        <Badge variant="outline" className="text-[7px] h-3 px-1">{entry.intent}</Badge>
                      )}
                      <span className="text-[8px] opacity-50 ml-auto">
                        {entry.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p>{entry.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Manual text input for transcript */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Ou digite manualmente o que foi dito..."
              rows={2}
              className="text-xs resize-none"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const text = (e.target as HTMLTextAreaElement).value.trim();
                  if (text) {
                    const analysis = analyzeClientMessage(text);
                    setTranscript(prev => [...prev, {
                      id: crypto.randomUUID(),
                      speaker: currentSpeaker,
                      text,
                      timestamp: new Date(),
                      intent: currentSpeaker === "cliente" ? analysis.intent : undefined,
                      score: currentSpeaker === "cliente" ? analysis.score : undefined,
                    }]);
                    if (currentSpeaker === "cliente") learnFromMessage(analysis.intent, text, analysis.score);
                    (e.target as HTMLTextAreaElement).value = "";
                  }
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Client analysis thermometer */}
      {clientAnalysis && (
        <ClosingThermometer score={clientAnalysis.score} label={`Última fala do cliente — Intenção: ${clientAnalysis.intent}`} />
      )}

      {/* AI Response Generator */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Sugestão de Resposta
            </CardTitle>
            <Button size="sm" onClick={handleGenerateResponse} disabled={generating} className="h-7 text-xs gap-1">
              {generating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Gerar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {generatedResponse ? (
            <div className="space-y-2">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs text-foreground whitespace-pre-wrap">{generatedResponse}</p>
              </div>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => {
                navigator.clipboard.writeText(generatedResponse);
                toast.success("Resposta copiada!");
              }}>
                <Copy className="h-2.5 w-2.5" /> Copiar
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              A IA analisará a conversa e sugerirá a melhor resposta
            </p>
          )}
        </CardContent>
      </Card>

      {/* Evolution Panel */}
      <NegotiationEvolutionPanel currentEntries={transcript.filter(t => t.speaker === "cliente").map(t => ({
        remetente_tipo: "cliente" as const,
        mensagem: t.text,
        intent: t.intent,
        score: t.score,
      }))} />

      {/* AI Coach */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Coach de Vendas (ao vivo)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1 mb-2">
            {[
              { label: "Como contornar?", q: "Como contornar a última objeção do cliente de forma assertiva?" },
              { label: "Técnica de urgência", q: "Me dê uma técnica de urgência para usar agora" },
              { label: "Próximo passo?", q: "Qual o melhor próximo passo para avançar o fechamento?" },
            ].map(qp => (
              <Badge
                key={qp.label}
                variant="secondary"
                className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => sendCoachMessage(qp.q)}
              >
                {qp.label}
              </Badge>
            ))}
          </div>

          <ScrollArea className="h-[180px] border rounded-lg">
            <div className="p-2 space-y-2">
              {aiCoachMessages.length === 0 ? (
                <div className="text-center py-6">
                  <Brain className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Pergunte estratégias ao coach durante a reunião</p>
                </div>
              ) : (
                aiCoachMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Textarea
              placeholder="Pergunte ao coach..."
              value={aiInput}
              onChange={e => setAIInput(e.target.value)}
              rows={2}
              className="text-xs resize-none"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendCoachMessage(aiInput);
                }
              }}
            />
            <Button size="icon" className="h-auto self-end" onClick={() => sendCoachMessage(aiInput)} disabled={aiLoading || !aiInput.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
