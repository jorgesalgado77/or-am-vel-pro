import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, User } from "lucide-react";

interface UserSelectorProps {
  open: boolean;
  onSelect: (userId: string) => void;
}

interface SimpleUser {
  id: string;
  nome_completo: string;
  apelido: string | null;
  ativo: boolean;
}

export function UserSelector({ open, onSelect }: UserSelectorProps) {
  const [users, setUsers] = useState<SimpleUser[]>([]);

  useEffect(() => {
    if (open) {
      supabase
        .from("usuarios")
        .select("id, nome_completo, apelido, ativo")
        .eq("ativo", true)
        .order("nome_completo")
        .then(({ data }) => {
          if (data) setUsers(data as SimpleUser[]);
        });
    }
  }, [open]);

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Selecione seu Usuário
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum usuário ativo encontrado. Cadastre um usuário nas configurações.
            </p>
          )}
          {users.map((u) => (
            <Button
              key={u.id}
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={() => onSelect(u.id)}
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">{u.apelido || u.nome_completo}</div>
                {u.apelido && <div className="text-xs text-muted-foreground">{u.nome_completo}</div>}
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
