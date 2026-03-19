import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChangePasswordDialogProps {
  open: boolean;
  userId: string;
  forced?: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, userId, forced, onClose }: ChangePasswordDialogProps) {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (novaSenha.length < 4) {
      toast.error("A senha deve ter pelo menos 4 caracteres");
      return;
    }
    if (novaSenha !== confirmar) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSaving(true);
    // Hash password before storing
    const { data: hashedSenha } = await supabase.rpc("hash_password", { plain_text: novaSenha }) as any;
    const { error } = await supabase
      .from("usuarios")
      .update({ senha: hashedSenha, primeiro_login: false } as any)
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao alterar senha");
    } else {
      toast.success("Senha alterada com sucesso!");
      setNovaSenha("");
      setConfirmar("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={forced ? undefined : () => onClose()}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={forced ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={forced ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {forced ? "Defina sua nova senha" : "Alterar Senha"}
          </DialogTitle>
          {forced && (
            <p className="text-sm text-muted-foreground">
              Por segurança, altere sua senha no primeiro acesso.
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nova Senha</Label>
            <div className="relative mt-1">
              <Input
                type={showPwd ? "text" : "password"}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Confirmar Senha</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita a senha"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          {!forced && <Button variant="outline" onClick={onClose}>Cancelar</Button>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
