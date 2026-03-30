/**
 * SidebarUserProfile — User profile section extracted from AppSidebar.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { Circle, Mail, UserCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OnlineUser } from "@/hooks/useOnlinePresence";

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

interface CurrentUser {
  nome_completo: string;
  apelido?: string | null;
  cargo_nome?: string | null;
  foto_url?: string | null;
  email?: string | null;
}

interface SidebarUserProfileProps {
  currentUser: CurrentUser | null;
  onlineUsers: OnlineUser[];
  collapsed: boolean;
  onProfile?: () => void;
}

export const SidebarUserProfile = React.memo(function SidebarUserProfile({
  currentUser, onlineUsers, collapsed, onProfile,
}: SidebarUserProfileProps) {
  if (!currentUser) {
    return collapsed ? (
      <div className="flex flex-col items-center gap-2">
        <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
        <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
      </div>
    ) : (
      <div className="flex items-start gap-3 mb-2">
        <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
        <div className="min-w-0 flex-1 space-y-2 py-1">
          <div className="h-3.5 w-24 bg-muted rounded animate-pulse" />
          <div className="h-3 w-16 bg-muted rounded animate-pulse" />
          <div className="h-2.5 w-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onProfile} className="focus:outline-none">
              <Avatar className="h-9 w-9 ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer">
                {currentUser.foto_url ? <AvatarImage src={currentUser.foto_url} alt={currentUser.nome_completo} /> : null}
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {getInitials(currentUser.nome_completo)}
                </AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            <p className="font-medium">{currentUser.apelido || currentUser.nome_completo}</p>
            {currentUser.cargo_nome && <p className="text-muted-foreground">{currentUser.cargo_nome}</p>}
          </TooltipContent>
        </Tooltip>
        <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-start gap-3 mb-2">
        <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/20">
          {currentUser.foto_url ? <AvatarImage src={currentUser.foto_url} alt={currentUser.nome_completo} /> : null}
          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
            {getInitials(currentUser.nome_completo)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {currentUser.apelido || currentUser.nome_completo}
          </p>
          {currentUser.cargo_nome && (
            <p className="text-xs text-muted-foreground truncate">{currentUser.cargo_nome}</p>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 mt-1 text-xs text-green-600 hover:text-green-700 transition-colors cursor-pointer">
                <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
                Online {onlineUsers.length > 0 && `(${onlineUsers.length})`}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-64 p-0">
              <div className="p-3 border-b border-border">
                <h4 className="text-sm font-semibold text-foreground">Usuários Online</h4>
                <p className="text-xs text-muted-foreground">{onlineUsers.length} conectado(s) agora</p>
              </div>
              <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                {onlineUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum usuário online</p>
                ) : (
                  onlineUsers.map((user) => (
                    <div key={user.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50">
                      <Avatar className="h-7 w-7 shrink-0">
                        {user.fotoUrl ? <AvatarImage src={user.fotoUrl} alt={user.nome} /> : null}
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                          {getInitials(user.nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{user.nome}</p>
                        {user.cargo && <p className="text-[10px] text-muted-foreground truncate">{user.cargo}</p>}
                      </div>
                      <Circle className="h-2 w-2 fill-green-500 text-green-500 shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          {currentUser.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{currentUser.email}</span>
            </p>
          )}
        </div>
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={onProfile}>
        <UserCircle className="h-3.5 w-3.5" />Meu Perfil
      </Button>
    </>
  );
});
