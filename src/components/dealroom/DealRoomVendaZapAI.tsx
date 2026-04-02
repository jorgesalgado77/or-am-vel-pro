/**
 * VendaZap AI integration inside Deal Room — real-time audio transcription,
 * automatic voice diarization, AI sales coaching, DB persistence, and PDF export.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mic, MicOff, Brain, Send, Download, RefreshCw, Sparkles,
  MessageSquare, Copy, User, Headphones, StopCircle, Play, Save,
  Fingerprint, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { miaInvoke } from "@/services/mia/MIAInvoke";
import { toast } from "sonner";
import { MIAFeedback } from "@/components/mia/MIAFeedback";
import jsPDF from "jspdf";
import { ClosingThermometer, analyzeClientMessage } from "@/components/vendazap/ClosingThermometer";
import { NegotiationEvolutionPanel, learnFromMessage, buildLearningContext } from "@/components/vendazap/NegotiationLearning";
import { COPY_TYPES } from "@/components/vendazap/VendaZapGenerateTab";
import { useVoiceEnrollment, compareVoice, extractLiveFingerprint, type VoiceFingerprint } from "@/hooks/useVoiceEnrollment";

interface Props {
  tenantId: string;
  clientName?: string;
  proposalValue?: number;
  sessionId?: string;
  currentUserId?: string;
  clientId?: string;
}

interface TranscriptEntry {
  id: string;
  speaker: "vendedor" | "cliente";
  text: string;
  timestamp: Date;
  intent?: string;
  score?: number;
  confidence?: number; // diarization confidence
}

interface AICoachMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function DealRoomVendaZapAI({ tenantId, clientName, proposalValue, sessionId, currentUserId, clientId }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<"vendedor" | "cliente">("vendedor");
  const [aiCoachMessages, setAICoachMessages] = useState<AICoachMessage[]>([]);
  const [aiInput, setAIInput] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState("");
  const [generating, setGenerating] = useState(false);
  const [autoDiarize, setAutoDiarize] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Voice enrollment
  const voiceEnrollment = useVoiceEnrollment(currentUserId || null);

  // Load enrollment on mount
  useEffect(() => {
    if (currentUserId) {
      voiceEnrollment.loadEnrollment();
    }
  }, [currentUserId]);

  // Current analysis from latest client message
  const lastClientMsg = [...transcript].reverse().find(t => t.speaker === "cliente");
  const clientAnalysis = lastClientMsg ? analyzeClientMessage(lastClientMsg.text) : null;

  /**
   * Identify speaker using voice fingerprint comparison.
   * Captures a short audio sample and compares against enrolled voice.
   */
  const identifySpeaker = useCallback((): "vendedor" | "cliente" => {
    if (!autoDiarize || !voiceEnrollment.enrolledFingerprint || !analyserRef.current) {
      return currentSpeaker;
    }

    try {
      const analyser = analyserRef.current;
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      analyser.getFloatTimeDomainData(dataArray);

      // Check if there's actual audio (not silence)
      let maxAmp = 0;
      for (let i = 0; i < dataArray.length; i++) {
        maxAmp = Math.max(maxAmp, Math.abs(dataArray[i]));
      }
      if (maxAmp < 0.01) return currentSpeaker;

      const liveFp = extractLiveFingerprint(dataArray, audioContextRef.current?.sampleRate || 44100);
      const similarity = compareVoice(voiceEnrollment.enrolledFingerprint, liveFp);

      // Threshold: >55% similarity = vendedor, else = cliente
      return similarity > 55 ? "vendedor" : "cliente";
    } catch {
      return currentSpeaker;
    }
  }, [autoDiarize, voiceEnrollment.enrolledFingerprint, currentSpeaker]);

  // Start/stop speech recognition with auto-diarization
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      mediaStreamRef.current = null;
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.");
      return;
    }

    // Setup audio context for diarization
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (autoDiarize && voiceEnrollment.enrolledFingerprint) {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
      }
    } catch {
      toast.error("Erro ao acessar microfone");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }

      if (finalText.trim()) {
        // Auto-identify speaker
        const detectedSpeaker = identifySpeaker();
        const analysis = analyzeClientMessage(finalText.trim());
        const similarity = voiceEnrollment.enrolledFingerprint && analyserRef.current ? (() => {
          try {
            const dataArray = new Float32Array(analyserRef.current!.fftSize);
            analyserRef.current!.getFloatTimeDomainData(dataArray);
            const liveFp = extractLiveFingerprint(dataArray, audioContextRef.current?.sampleRate || 44100);
            return compareVoice(voiceEnrollment.enrolledFingerprint!, liveFp);
          } catch { return undefined; }
        })() : undefined;

        const entry: TranscriptEntry = {
          id: crypto.randomUUID(),
          speaker: detectedSpeaker,
          text: finalText.trim(),
          timestamp: new Date(),
          intent: detectedSpeaker === "cliente" ? analysis.intent : undefined,
          score: detectedSpeaker === "cliente" ? analysis.score : undefined,
          confidence: similarity,
        };
        setTranscript(prev => [...prev, entry]);

        if (detectedSpeaker === "cliente") {
          learnFromMessage(analysis.intent, finalText.trim(), analysis.score);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    toast.success("🎙️ Gravação iniciada" + (autoDiarize && voiceEnrollment.isEnrolled ? " com diarização automática!" : "!"));
  }, [isRecording, currentSpeaker, autoDiarize, voiceEnrollment.enrolledFingerprint, identifySpeaker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  // Save transcript to database
  const saveTranscript = useCallback(async () => {
    if (transcript.length === 0) {
      toast.error("Nenhuma transcrição para salvar.");
      return;
    }
    setSaving(true);
    try {
      const transcriptData = transcript.map(t => ({
        speaker: t.speaker,
        text: t.text,
        timestamp: t.timestamp.toISOString(),
        intent: t.intent || null,
        score: t.score || null,
        confidence: t.confidence || null,
      }));

      const clientEntries = transcript.filter(t => t.speaker === "cliente");
      const scored = clientEntries.filter(t => t.score !== undefined);
      const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, t) => s + (t.score || 0), 0) / scored.length) : 0;
      const objections = clientEntries.filter(t => t.intent === "objeção" || t.intent === "resistência" || t.intent === "enviar_preco");

      const { error } = await supabase
        .from("dealroom_meeting_transcripts" as any)
        .insert({
          tenant_id: tenantId,
          session_id: sessionId || crypto.randomUUID(),
          client_id: clientId || null,
          usuario_id: currentUserId || null,
          client_name: clientName || null,
          transcript: transcriptData,
          total_entries: transcript.length,
          avg_closing_score: avgScore,
          total_objections: objections.length,
          duration_seconds: transcript.length > 1
            ? Math.round((transcript[transcript.length - 1].timestamp.getTime() - transcript[0].timestamp.getTime()) / 1000)
            : 0,
          ai_coach_messages: aiCoachMessages.length > 0 ? aiCoachMessages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })) : null,
        });

      if (error) {
        console.error("Save transcript error:", error);
        toast.error("Erro ao salvar transcrição. Tabela pode não existir ainda.");
      } else {
        setSaved(true);
        toast.success("✅ Transcrição salva no histórico do cliente!");
      }
    } catch {
      toast.error("Erro de conexão ao salvar");
    }
    setSaving(false);
  }, [transcript, aiCoachMessages, tenantId, sessionId, clientId, currentUserId, clientName]);

  // Auto-save when recording stops and there are entries
  useEffect(() => {
    if (!isRecording && transcript.length > 0 && !saved) {
      saveTranscript();
    }
  }, [isRecording]);

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
      const { data, error } = await miaInvoke("vendazap-ai", {
          nome_cliente: clientName || "Cliente",
          valor_orcamento: proposalValue,
          status_negociacao: "em_negociacao",
          mensagem_cliente: recentClientMsgs[recentClientMsgs.length - 1].text,
          tipo_copy: "fechamento",
          tom: "persuasivo",
          historico,
          learning_context: learningContext || undefined,
        }, { tenantId: tenantId || "", userId: "system", origin: "dealroom", context: "vendazap" });

      if (error) throw error;
      setGeneratedResponse(data?.mensagem || "");
    } catch {
      toast.error("Erro ao gerar resposta da IA");
    }
    setGenerating(false);
  };

  // AI Coach
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

      const { data, error } = await miaInvoke("vendazap-ai", {
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
        }, { tenantId: tenantId || "", userId: "system", origin: "dealroom", context: "dealroom" });

      if (error) throw error;
      const reply = data?.reply || "Erro ao obter resposta.";
      setAICoachMessages(prev => [...prev, { role: "assistant", content: reply, timestamp: new Date() }]);
    } catch {
      toast.error("Erro na IA");
    }
    setAILoading(false);
  };

  // Export PDF
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
    addText(`Diarizacao automatica: ${autoDiarize && voiceEnrollment.isEnrolled ? "Ativa" : "Manual"}`, margin, 10, [60, 60, 60]);
    y += 6;

    doc.setDrawColor(0, 150, 80);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Transcript
    addText("Transcricao Completa da Reuniao", margin, 12, [0, 0, 0], true);
    y += 4;

    transcript.forEach((entry) => {
      checkPage(20);
      const isVendedor = entry.speaker === "vendedor";
      const speakerLabel = isVendedor ? "Vendedor/Projetista" : "Cliente";
      const time = entry.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const intentLabel = entry.intent ? ` [${entry.intent}]` : "";
      const scoreLabel = entry.score !== undefined ? ` (${entry.score}%)` : "";
      const confLabel = entry.confidence !== undefined ? ` conf:${entry.confidence}%` : "";

      addText(`${time} — ${speakerLabel}${intentLabel}${scoreLabel}${confLabel}`, margin, 8, isVendedor ? [0, 100, 60] : [180, 80, 0], true);
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
      {/* Voice Enrollment Status */}
      {!voiceEnrollment.isEnrolled && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-xs font-medium text-foreground">Registro de Voz não configurado</p>
                  <p className="text-[10px] text-muted-foreground">
                    Grave uma amostra da sua voz para ativar a identificação automática de quem fala
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-amber-500/50"
                onClick={voiceEnrollment.isRecording ? voiceEnrollment.stopRecording : voiceEnrollment.startRecording}
                disabled={voiceEnrollment.loading}
              >
                {voiceEnrollment.loading ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : voiceEnrollment.isRecording ? (
                  <><StopCircle className="h-3 w-3 text-destructive" /> Parar (5s)</>
                ) : (
                  <><Mic className="h-3 w-3" /> Gravar Voz</>
                )}
              </Button>
            </div>
            {voiceEnrollment.isRecording && (
              <div className="mt-2">
                <div className="h-1.5 bg-amber-200 dark:bg-amber-900 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full animate-pulse" style={{ width: "100%" }} />
                </div>
                <p className="text-[10px] text-amber-600 mt-1">Fale normalmente por 5 segundos...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {voiceEnrollment.isEnrolled && (
        <div className="flex items-center gap-2 px-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] text-primary font-medium">Voz registrada — diarização automática ativa</span>
        </div>
      )}

      {/* Recording Controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Transcrição ao Vivo
            </CardTitle>
            <div className="flex items-center gap-2">
              {transcript.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={saveTranscript}
                    disabled={saving || saved}
                  >
                    {saved ? <CheckCircle2 className="h-3 w-3 text-primary" /> : saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {saved ? "Salvo" : "Salvar"}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={handleExportPDF}>
                    <Download className="h-3 w-3" /> PDF
                  </Button>
                </>
              )}
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Speaker toggle — shown only when no auto-diarization */}
          <div className="flex items-center gap-2">
            {(!autoDiarize || !voiceEnrollment.isEnrolled) && (
              <>
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
              </>
            )}
            {autoDiarize && voiceEnrollment.isEnrolled && (
              <Badge variant="secondary" className="text-[9px] h-5 gap-1">
                <Fingerprint className="h-2.5 w-2.5" /> Diarização Automática
              </Badge>
            )}
            {isRecording && (
              <Badge variant="destructive" className="text-[9px] h-5 animate-pulse gap-1 ml-auto">
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
                      {entry.confidence !== undefined && (
                        <span className="text-[7px] opacity-40 ml-1">{entry.confidence}%</span>
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
                <MIAFeedback
                  tenantId={tenantId || ""}
                  userId="system"
                  context="vendazap"
                  responseId={`dealroom-vendazap-response-${Date.now()}`}
                  actionTaken="vendazap-ai-response"
                  compact
                  className="mt-1.5"
                />
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
                      {msg.role === "assistant" && (
                        <MIAFeedback
                          tenantId={tenantId || ""}
                          userId="system"
                          context="dealroom"
                          responseId={`coach-${i}`}
                          actionTaken="dealroom-coach"
                          compact
                          className="mt-0.5"
                        />
                      )}
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
