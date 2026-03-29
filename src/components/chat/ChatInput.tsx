import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, Send, Paperclip, Mic, Square, Loader2, Video, X, SwitchCamera } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { QuickRepliesPopover } from "./QuickRepliesPopover";
import { ChatProductPicker } from "./ChatProductPicker";
import type { QuickReply } from "@/hooks/useQuickReplies";

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onAttachmentSent: (url: string, name: string, tipo: string) => void;
  sending: boolean;
  trackingId: string;
  onKeystroke?: () => void;
  quickReplies?: QuickReply[];
  quickRepliesLoading?: boolean;
  onAddQuickReply?: (titulo: string, mensagem: string) => void;
  onRemoveQuickReply?: (id: string) => void;
  tenantId?: string | null;
  onSendProductText?: (text: string, imageUrl?: string) => void;
  detectedDiscProfile?: string;
}

function buildFileName(file: File) {
  if (file.name?.trim()) return file.name;
  const extension = file.type?.split("/")[1]?.split(";")[0] || "bin";
  return `arquivo_${Date.now()}.${extension}`;
}

export function ChatInput({ value, onChange, onSend, onAttachmentSent, sending, trackingId, onKeystroke, quickReplies, quickRepliesLoading, onAddQuickReply, onRemoveQuickReply, tenantId, onSendProductText, detectedDiscProfile }: Props) {
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const uploadFile = useCallback(async (originalFile: File) => {
    const file = new File([originalFile], buildFileName(originalFile), { type: originalFile.type || "application/octet-stream" });

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `chat/${trackingId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(path);

      onAttachmentSent(urlData.publicUrl, file.name, file.type || "application/octet-stream");
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  }, [trackingId, onAttachmentSent]);

  const handleSelectedFile = useCallback((file?: File | null) => {
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 25MB)");
      return;
    }

    uploadFile(file);
  }, [uploadFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedFile(e.target.files?.[0]);
    e.target.value = "";
  };

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
        await uploadFile(file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  // Camera functions
  const openCamera = async () => {
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: true,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast.error("Não foi possível acessar a câmera do dispositivo");
      setCameraOpen(false);
    }
  };

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraRecording(false);
  };

  const switchCamera = async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode },
        audio: true,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast.error("Não foi possível alternar a câmera");
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
      closeCamera();
      await uploadFile(file);
    }, "image/jpeg", 0.9);
  };

  const startVideoRecording = () => {
    if (!cameraStreamRef.current) return;
    try {
      const recorder = new MediaRecorder(cameraStreamRef.current, { mimeType: "video/webm" });
      cameraChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) cameraChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(cameraChunksRef.current, { type: "video/webm" });
        const file = new File([blob], `video_${Date.now()}.webm`, { type: "video/webm" });
        closeCamera();
        await uploadFile(file);
      };

      recorder.start();
      cameraRecorderRef.current = recorder;
      setCameraRecording(true);
    } catch {
      toast.error("Não foi possível gravar vídeo");
    }
  };

  const stopVideoRecording = () => {
    cameraRecorderRef.current?.stop();
    cameraRecorderRef.current = null;
    setCameraRecording(false);
  };

  return (
    <div className="p-2 border-t border-border bg-card">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-end gap-1.5">
        {quickReplies && onAddQuickReply && onRemoveQuickReply && (
          <QuickRepliesPopover
            replies={quickReplies}
            onSelect={(msg) => onChange(msg)}
            onAdd={onAddQuickReply}
            onRemove={onRemoveQuickReply}
            loading={quickRepliesLoading}
          />
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={openCamera}
          disabled={uploading || sending}
          aria-label="Abrir câmera"
          title="Abrir câmera para foto ou vídeo"
        >
          <Camera className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          aria-label="Anexar arquivo"
          title="Anexar arquivo"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>

        {tenantId && onSendProductText && (
          <ChatProductPicker
            tenantId={tenantId}
            onSendProduct={(text, imageUrl) => {
              if (imageUrl) {
                onAttachmentSent(imageUrl, "produto.jpg", "image/jpeg");
              }
              onSendProductText(text, imageUrl);
            }}
          />
        )}

        <Button
          variant="ghost"
          size="icon"
          className={`h-9 w-9 shrink-0 ${recording ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
          onClick={recording ? stopRecording : startRecording}
          disabled={uploading || sending}
          aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          title={recording ? "Parar gravação" : "Gravar áudio"}
        >
          {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
        </Button>

        <Textarea
          value={value}
          onChange={(e) => { onChange(e.target.value); onKeystroke?.(); }}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          className="min-h-[36px] max-h-[120px] resize-none text-sm flex-1"
          rows={1}
        />

        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onSend}
          disabled={sending || uploading || (!value.trim() && !uploading)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {recording && (
        <div className="flex items-center gap-2 mt-1.5 px-2">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs text-destructive font-medium">Gravando áudio...</span>
        </div>
      )}

      {/* Camera Dialog */}
      <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) closeCamera(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Camera className="h-4 w-4" />
              Câmera
            </DialogTitle>
          </DialogHeader>
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {cameraRecording && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 text-white px-2 py-1 rounded-full text-xs">
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                Gravando...
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 px-4 py-3 bg-card">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={switchCamera}
              title="Alternar câmera"
            >
              <SwitchCamera className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg"
              onClick={takePhoto}
              disabled={cameraRecording}
              title="Tirar foto"
            >
              <Camera className="h-6 w-6" />
            </Button>

            <Button
              variant={cameraRecording ? "destructive" : "outline"}
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={cameraRecording ? stopVideoRecording : startVideoRecording}
              title={cameraRecording ? "Parar gravação" : "Gravar vídeo"}
            >
              {cameraRecording ? <Square className="h-4 w-4 fill-current" /> : <Video className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
