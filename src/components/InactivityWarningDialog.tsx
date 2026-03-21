import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Timer, ShieldAlert } from "lucide-react";

interface Props {
  open: boolean;
  onStayConnected: () => void;
}

export function InactivityWarningDialog({ open, onStayConnected }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (!open) {
      setSecondsLeft(60);
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
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
