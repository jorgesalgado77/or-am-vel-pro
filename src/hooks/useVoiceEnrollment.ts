/**
 * Voice Enrollment hook — records a vendor's voice sample, stores it in the DB,
 * and uses it for automatic speaker diarization during Deal Room meetings.
 * 
 * The voice "fingerprint" is a simplified spectral signature extracted via Web Audio API.
 * It's stored in the `usuarios` table as `voice_fingerprint` (JSONB).
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface VoiceFingerprint {
  /** Average frequency magnitudes across 16 bands */
  bands: number[];
  /** Average pitch (fundamental frequency estimate) */
  avgPitch: number;
  /** Average energy */
  avgEnergy: number;
  /** Timestamp of enrollment */
  enrolledAt: string;
}

/**
 * Extract a simple spectral fingerprint from an AudioBuffer.
 */
function extractFingerprint(audioBuffer: AudioBuffer): VoiceFingerprint {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Compute FFT-like bands using simple energy in frequency buckets
  const fftSize = 2048;
  const numBands = 16;
  const bands = new Array(numBands).fill(0);
  let totalEnergy = 0;

  // Process in overlapping windows
  const hopSize = fftSize / 2;
  let windowCount = 0;

  for (let offset = 0; offset + fftSize < data.length; offset += hopSize) {
    const window = data.slice(offset, offset + fftSize);

    // Simple spectral estimation via autocorrelation-inspired bucketing
    for (let b = 0; b < numBands; b++) {
      const lo = Math.floor((b / numBands) * (fftSize / 2));
      const hi = Math.floor(((b + 1) / numBands) * (fftSize / 2));
      let bandEnergy = 0;
      for (let i = lo; i < hi && i < window.length; i++) {
        bandEnergy += window[i] * window[i];
      }
      bands[b] += bandEnergy / (hi - lo || 1);
    }

    for (let i = 0; i < window.length; i++) {
      totalEnergy += window[i] * window[i];
    }
    windowCount++;
  }

  // Normalize bands
  const maxBand = Math.max(...bands, 0.0001);
  for (let b = 0; b < numBands; b++) {
    bands[b] = Math.round((bands[b] / maxBand) * 1000) / 1000;
  }

  // Estimate pitch via zero-crossing rate
  let zeroCrossings = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  const avgPitch = Math.round((zeroCrossings * sampleRate) / (2 * data.length));
  const avgEnergy = Math.round((totalEnergy / (windowCount || 1)) * 10000) / 10000;

  return {
    bands,
    avgPitch,
    avgEnergy,
    enrolledAt: new Date().toISOString(),
  };
}

/**
 * Compare two fingerprints and return a similarity score (0–100).
 */
export function compareVoice(enrolled: VoiceFingerprint, sample: VoiceFingerprint): number {
  if (!enrolled?.bands || !sample?.bands) return 0;

  // Band similarity (cosine-like)
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(enrolled.bands.length, sample.bands.length); i++) {
    dotProduct += enrolled.bands[i] * sample.bands[i];
    normA += enrolled.bands[i] * enrolled.bands[i];
    normB += sample.bands[i] * sample.bands[i];
  }
  const bandSim = normA > 0 && normB > 0 ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

  // Pitch similarity
  const pitchDiff = Math.abs(enrolled.avgPitch - sample.avgPitch);
  const pitchSim = Math.max(0, 1 - pitchDiff / 200);

  // Combined score
  return Math.round((bandSim * 0.7 + pitchSim * 0.3) * 100);
}

/**
 * Extract fingerprint from a short audio chunk (Float32Array).
 */
export function extractLiveFingerprint(samples: Float32Array, sampleRate: number): VoiceFingerprint {
  // Create an offline AudioBuffer
  const ctx = new OfflineAudioContext(1, samples.length, sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples.buffer as ArrayBuffer), 0);
  return extractFingerprint(buffer);
}

export function useVoiceEnrollment(usuarioId: string | null) {
  const [isRecording, setIsRecording] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolledFingerprint, setEnrolledFingerprint] = useState<VoiceFingerprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  // Load existing enrollment
  const loadEnrollment = useCallback(async () => {
    if (!usuarioId) return null;
    try {
      const { data } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id", usuarioId)
        .single();

      if ((data as any)?.voice_fingerprint) {
        const fp = (data as any).voice_fingerprint as VoiceFingerprint;
        setEnrolledFingerprint(fp);
        setIsEnrolled(true);
        return fp;
      }
    } catch {
      // Column might not exist yet
    }
    return null;
  }, [usuarioId]);

  // Start recording voice sample
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        // Don't auto-save; let user preview first
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordedBlob(null);
      setRecordingSeconds(0);

      // Timer
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);

      // Auto-stop after 3 minutes (180s)
      autoStopRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
      }, 180000);
    } catch {
      toast.error("Erro ao acessar microfone");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
  }, []);

  // Play back recorded audio
  const playRecording = useCallback(() => {
    if (!recordedBlob) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(recordedBlob);
    setAudioUrl(url);
    const audio = new Audio(url);
    audio.play();
  }, [recordedBlob, audioUrl]);

  // Save recorded blob
  const saveRecording = useCallback(async () => {
    if (!recordedBlob) return;
    await processAndSave(recordedBlob);
  }, [recordedBlob]);

  // Discard recorded blob
  const discardRecording = useCallback(() => {
    setRecordedBlob(null);
    setRecordingSeconds(0);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }, [audioUrl]);

  const processAndSave = async (blob: Blob) => {
    if (!usuarioId) return;
    setLoading(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const fingerprint = extractFingerprint(audioBuffer);
      audioCtx.close();

      // Save to DB
      const { error } = await (supabase
        .from("usuarios")
        .update({ voice_fingerprint: fingerprint } as any)
        .eq("id", usuarioId));

      if (error) {
        console.error("Save voice fingerprint error:", error);
        toast.error("Erro ao salvar registro de voz");
      } else {
        setEnrolledFingerprint(fingerprint);
        setIsEnrolled(true);
        toast.success("✅ Registro de voz salvo com sucesso!");
      }
    } catch (err) {
      console.error("Voice processing error:", err);
      toast.error("Erro ao processar áudio");
    }
    setLoading(false);
  };

  // Reset enrollment
  const resetEnrollment = useCallback(async (targetUsuarioId?: string) => {
    const uid = targetUsuarioId || usuarioId;
    if (!uid) return;
    setLoading(true);
    try {
      const { error } = await (supabase
        .from("usuarios")
        .update({ voice_fingerprint: null } as any)
        .eq("id", uid));

      if (error) {
        toast.error("Erro ao resetar registro de voz");
      } else {
        if (!targetUsuarioId || targetUsuarioId === usuarioId) {
          setEnrolledFingerprint(null);
          setIsEnrolled(false);
        }
        toast.success("Registro de voz removido");
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setLoading(false);
  }, [usuarioId]);

  return {
    isRecording,
    isEnrolled,
    enrolledFingerprint,
    loading,
    loadEnrollment,
    startRecording,
    stopRecording,
    resetEnrollment,
  };
}
