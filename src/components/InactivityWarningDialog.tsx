import {useEffect, useState} from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Button} from "@/components/ui/button";
import {Timer, ShieldAlert} from "lucide-react";

const INACTIVITY_SOUND_KEY = "inactivity_sound_enabled";

export function isInactivitySoundEnabled(): boolean {
  const val = localStorage.getItem(INACTIVITY_SOUND_KEY);
  return val === null ? true : val === "true";
}

export function setInactivitySoundEnabled(enabled: boolean) {
  localStorage.setItem(INACTIVITY_SOUND_KEY, String(enabled));
}

function playAlertBeep() {
  if (!isInactivitySoundEnabled()) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = now + i * 0.25;
      gain.gain.setValueAtTime(0.4, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {}
}

interface Props {
  open: boolean;
  onStayConnected: () => void;
}

export function InactivityWarningDialog({ open, onStayConnected }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(60);

  // Play alert sound when dialog opens and every 15 seconds
  useEffect(() => {
    if (!open) {
      setSecondsLeft(60);
      return;
    }

    playAlertBeep();

    const beepInterval = setInterval(playAlertBeep, 15000);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(beepInterval);
    };
  }, [open]);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-lg">Sessão prestes a expirar</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Você está inativo há alguns minutos. Por segurança, sua sessão será encerrada automaticamente.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center justify-center gap-2 py-4">
          <Timer className="h-5 w-5 text-destructive animate-pulse" />
          <span className="text-2xl font-bold tabular-nums text-destructive">
            {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        </div>

        <AlertDialogFooter>
          <Button onClick={onStayConnected} className="w-full" size="lg">
            Continuar conectado
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
