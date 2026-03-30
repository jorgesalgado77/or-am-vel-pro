/**
 * useMeetingTranscription — Web Speech API live transcription for Deal Room meetings
 * Exports transcription data, PDF generation, and recording controls
 */

import { useState, useRef, useCallback } from "react";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface TranscriptEntry {
  speaker: "vendedor" | "cliente";
  text: string;
  timestamp: string;
  closingScore?: number;
  intent?: string;
}

interface UseMeetingTranscriptionOpts {
  tenantId: string;
  sessionId: string;
  clientName?: string;
  clientId?: string;
  userId?: string;
  voiceFingerprint?: any;
}

export function useMeetingTranscription(opts: UseMeetingTranscriptionOpts) {
  const { tenantId, sessionId, clientName, clientId, userId } = opts;
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const startTranscription = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Seu navegador não suporta transcrição de voz. Use o Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text.length < 2) continue;

          // Simple heuristic: odd entries are vendor, even are client
          // In real scenario, voice fingerprint would be used for diarization
          const entry: TranscriptEntry = {
            speaker: "vendedor", // Default; diarization would improve this
            text,
            timestamp: new Date().toISOString(),
          };

          // Detect closing signals
          const lowerText = text.toLowerCase();
          if (lowerText.includes("prazo") || lowerText.includes("quando fica pronto") ||
              lowerText.includes("vamos fechar") || lowerText.includes("tá bom") ||
              lowerText.includes("aceito") || lowerText.includes("pode fazer")) {
            entry.intent = "sinal_fechamento";
            entry.closingScore = 80;
          } else if (lowerText.includes("caro") || lowerText.includes("desconto") ||
                     lowerText.includes("concorrente") || lowerText.includes("não sei")) {
            entry.intent = "objeção";
            entry.closingScore = 30;
          }

          setTranscript(prev => [...prev, entry]);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return; // Normal silence
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast.error("Permissão de microfone negada. Habilite nas configurações do navegador.");
        stopTranscription();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still transcribing
      if (recognitionRef.current && isTranscribing) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsTranscribing(true);
    setElapsedSeconds(0);

    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    toast.success("Transcrição iniciada");
  }, [isTranscribing]);

  const stopTranscription = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTranscribing(false);
    toast.info("Transcrição pausada");
  }, []);

  const saveTranscription = useCallback(async () => {
    if (transcript.length === 0) {
      toast.error("Nenhuma transcrição para salvar");
      return;
    }

    const objections = transcript.filter(e => e.intent === "objeção").length;
    const avgScore = transcript.filter(e => e.closingScore).reduce((s, e) => s + (e.closingScore || 0), 0) /
      Math.max(1, transcript.filter(e => e.closingScore).length);

    const { error } = await supabase
      .from("dealroom_meeting_transcripts" as any)
      .insert({
        tenant_id: tenantId,
        session_id: sessionId,
        client_name: clientName || null,
        client_id: clientId || null,
        usuario_id: userId || null,
        transcript: transcript,
        total_entries: transcript.length,
        avg_closing_score: Math.round(avgScore),
        total_objections: objections,
        duration_seconds: elapsedSeconds,
      });

    if (error) {
      console.error("Error saving transcription:", error);
      toast.error("Erro ao salvar transcrição");
    } else {
      toast.success("Transcrição salva com sucesso!");
    }
  }, [transcript, tenantId, sessionId, clientName, clientId, userId, elapsedSeconds]);

  const exportTranscriptionPdf = useCallback(() => {
    if (transcript.length === 0) {
      toast.error("Nenhuma transcrição para exportar");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Transcrição da Reunião — Deal Room", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Cliente: ${clientName || "N/A"}`, margin, y);
    y += 5;
    doc.text(`Data: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, margin, y);
    y += 5;
    doc.text(`Duração: ${Math.floor(elapsedSeconds / 60)}min ${elapsedSeconds % 60}s`, margin, y);
    y += 5;

    const objections = transcript.filter(e => e.intent === "objeção").length;
    const closingSignals = transcript.filter(e => e.intent === "sinal_fechamento").length;
    doc.text(`Falas: ${transcript.length} | Objeções: ${objections} | Sinais de Fechamento: ${closingSignals}`, margin, y);
    y += 10;

    // Separator
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Transcript entries
    doc.setFontSize(9);
    for (const entry of transcript) {
      if (y > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage();
        y = margin;
      }

      const time = entry.timestamp
        ? format(new Date(entry.timestamp), "HH:mm:ss", { locale: ptBR })
        : "";
      const speaker = entry.speaker === "vendedor" ? "🎤 Vendedor" : "👤 Cliente";
      const intentTag = entry.intent === "objeção" ? " [OBJEÇÃO]" : entry.intent === "sinal_fechamento" ? " [SINAL DE FECHAMENTO]" : "";

      doc.setFont("helvetica", "bold");
      doc.setTextColor(entry.speaker === "vendedor" ? 0 : 80, entry.speaker === "vendedor" ? 100 : 80, entry.speaker === "vendedor" ? 200 : 80);
      doc.text(`${speaker} ${time}${intentTag}`, margin, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(entry.text, maxWidth);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 4;
    }

    // Coaching section
    if (objections > 0 || closingSignals > 0) {
      if (y > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage();
        y = margin;
      }

      y += 5;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 80, 180);
      doc.text("Coaching da IA", margin, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);

      if (objections > 0) {
        const objTexts = transcript.filter(e => e.intent === "objeção").map(e => `"${e.text}"`);
        doc.text(`Objeções detectadas (${objections}):`, margin, y);
        y += 4;
        for (const t of objTexts) {
          const lines = doc.splitTextToSize(`• ${t}`, maxWidth - 5);
          if (y + lines.length * 4 > doc.internal.pageSize.getHeight() - 15) {
            doc.addPage();
            y = margin;
          }
          doc.text(lines, margin + 5, y);
          y += lines.length * 4 + 2;
        }
        y += 3;
        doc.text("Sugestão: Reforce o valor percebido e ofereça condições diferenciadas.", margin, y);
        y += 6;
      }

      if (closingSignals > 0) {
        doc.text(`Sinais de fechamento detectados (${closingSignals}):`, margin, y);
        y += 4;
        doc.text("Sugestão: O cliente demonstrou interesse. Proponha o fechamento imediato.", margin, y);
      }
    }

    doc.save(`transcricao_reuniao_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`);
    toast.success("PDF exportado com sucesso!");
  }, [transcript, clientName, elapsedSeconds]);

  return {
    isTranscribing,
    transcript,
    elapsedSeconds,
    startTranscription,
    stopTranscription,
    saveTranscription,
    exportTranscriptionPdf,
  };
}
