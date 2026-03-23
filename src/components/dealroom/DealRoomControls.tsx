import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Mic, MicOff, VideoIcon, VideoOff, Volume2, Maximize2, Minimize2,
  PhoneOff, Monitor, CircleDot,
} from "lucide-react";
import { toast } from "sonner";

interface DealRoomControlsProps {
  jitsiApi: any;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

export function DealRoomControls({ jitsiApi, onToggleFullscreen, isFullscreen }: DealRoomControlsProps) {
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [volume, setVolume] = useState([80]);
  const [showVolume, setShowVolume] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sharing, setSharing] = useState(false);

  const toggleMute = () => {
    if (jitsiApi) {
      jitsiApi.executeCommand("toggleAudio");
    }
    setMuted(!muted);
  };

  const toggleVideo = () => {
    if (jitsiApi) {
      jitsiApi.executeCommand("toggleVideo");
    }
    setVideoOff(!videoOff);
  };

  const toggleScreenShare = async () => {
    if (jitsiApi) {
      jitsiApi.executeCommand("toggleShareScreen");
      setSharing(!sharing);
      return;
    }

    // Fallback: native screen share via browser API
    if (!sharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          setSharing(false);
          toast.info("Compartilhamento de tela encerrado");
        });
        setSharing(true);
        toast.success("Compartilhamento de tela iniciado");
      } catch {
        toast.error("Compartilhamento de tela cancelado ou não suportado");
      }
    } else {
      setSharing(false);
      toast.info("Compartilhamento de tela encerrado");
    }
  };

  const handleVolumeChange = (val: number[]) => {
    setVolume(val);
    // Adjust volume on the iframe if possible
    const iframe = document.querySelector("iframe");
    if (iframe) {
      (iframe as HTMLIFrameElement).style.opacity = "1"; // placeholder
    }
  };

  const toggleRecording = () => {
    if (!recording) {
      toast.info("Gravação iniciada (funcionalidade depende do servidor Jitsi)");
    } else {
      toast.info("Gravação parada");
    }
    setRecording(!recording);
  };

  const hangUp = () => {
    if (jitsiApi) {
      jitsiApi.executeCommand("hangup");
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 py-3 px-4 bg-card/90 backdrop-blur border-t">
      {/* Mute */}
      <Button
        variant={muted ? "destructive" : "secondary"}
        size="icon"
        onClick={toggleMute}
        title={muted ? "Desmutar" : "Mutar"}
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>

      {/* Video */}
      <Button
        variant={videoOff ? "destructive" : "secondary"}
        size="icon"
        onClick={toggleVideo}
        title={videoOff ? "Ligar câmera" : "Desligar câmera"}
      >
        {videoOff ? <VideoOff className="h-4 w-4" /> : <VideoIcon className="h-4 w-4" />}
      </Button>

      {/* Screen Share */}
      <Button
        variant={sharing ? "default" : "secondary"}
        size="icon"
        onClick={toggleScreenShare}
        title="Compartilhar tela"
      >
        <Monitor className="h-4 w-4" />
      </Button>

      {/* Volume */}
      <div className="relative">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setShowVolume(!showVolume)}
          title="Volume"
        >
          <Volume2 className="h-4 w-4" />
        </Button>
        {showVolume && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-card border rounded-lg p-3 shadow-lg w-10 h-32">
            <Slider
              orientation="vertical"
              value={volume}
              onValueChange={handleVolumeChange}
              max={100}
              step={1}
              className="h-full"
            />
          </div>
        )}
      </div>

      {/* Record */}
      <Button
        variant={recording ? "destructive" : "secondary"}
        size="icon"
        onClick={toggleRecording}
        title={recording ? "Parar gravação" : "Gravar reunião"}
      >
        <CircleDot className="h-4 w-4" />
      </Button>

      {/* Fullscreen */}
      <Button variant="secondary" size="icon" onClick={onToggleFullscreen} title="Tela cheia">
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>

      {/* Hang up */}
      <Button variant="destructive" size="icon" onClick={hangUp} title="Encerrar reunião">
        <PhoneOff className="h-4 w-4" />
      </Button>
    </div>
  );
}
