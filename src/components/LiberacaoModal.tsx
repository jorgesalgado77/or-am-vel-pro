import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck } from "lucide-react";

interface LiberacaoModalProps {
  open: boolean;
  onClose: () => void;
}

export function LiberacaoModal({ open, onClose }: LiberacaoModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Liberação
          </DialogTitle>
        </DialogHeader>
        <div className="py-8 text-center text-muted-foreground">
          <p>Módulo de Liberação em construção.</p>
          <p className="text-sm mt-2">As funções serão definidas em breve.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
