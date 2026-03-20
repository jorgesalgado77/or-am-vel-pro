import { useState } from "react";
import { Users, Calculator, Settings, LogOut, Phone, Mail, LayoutDashboard, KeyRound, LifeBuoy, MessageCircle, Receipt, CreditCard, Circle, Bot, Video, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OnlineUser } from "@/hooks/useOnlinePresence";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onChangePassword?: () => void;
  onSupport?: () => void;
  onProfile?: () => void;
  unreadMessages?: number;
  onlineUsers?: OnlineUser[];
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function AppSidebar({ activeView, onViewChange, onChangePassword, onSupport, onProfile, unreadMessages = 0, onlineUsers = [] }: AppSidebarProps) {
  const { settings } = useCompanySettings();
  const { currentUser, logout, hasPermission } = useCurrentUser();

  const isAdmin = currentUser?.cargo_nome?.toUpperCase().includes("ADMINISTRADOR") || currentUser?.cargo_nome?.toUpperCase().includes("ADMIN");

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "clientes" as const, show: true, badge: null },
    { id: "clients", label: "Clientes", icon: Users, perm: "clientes" as const, show: true, badge: null },
    { id: "simulator", label: "Negociação", icon: Calculator, perm: "simulador" as const, show: true, badge: null },
    { id: "payroll", label: "Folha de Pagamento", icon: Receipt, perm: "configuracoes" as const, show: isAdmin, badge: null },
    { id: "settings", label: "Configurações", icon: Settings, perm: "configuracoes" as const, show: isAdmin, badge: null },
    { id: "plans", label: "Planos de Assinatura", icon: CreditCard, perm: "configuracoes" as const, show: isAdmin, badge: null },
    { id: "vendazap", label: "VendaZap AI", icon: Bot, perm: "simulador" as const, show: true, badge: "ADD-ON" },
    { id: "vendazap-chat", label: "Chat Vendas", icon: MessageCircle, perm: "clientes" as const, show: true, badge: "ADD-ON" },
    { id: "dealroom", label: "Deal Room", icon: Video, perm: "simulador" as const, show: true, badge: "ADD-ON" },
  ];

  return (
    <aside className="w-60 border-r border-border bg-card flex flex-col h-screen fixed left-0 top-0">
      {/* App branding - always OrçaMóvel PRO */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        {settings.logo_url && (
          <img src={settings.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
        )}
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            OrçaMóvel PRO
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Orce. Venda. Simplifique</p>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems
          .filter((item) => item.show && hasPermission(item.perm))
          .map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150",
                activeView === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4 font-bold bg-primary/10 text-primary border-primary/20">
                  {item.badge}
                </Badge>
              )}
            </button>
          ))}
        {/* Mensagens button */}
        <div className="mt-auto pt-2 border-t border-border mx-1 space-y-0.5">
          <button
            onClick={() => onViewChange("messages")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150",
              activeView === "messages"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <MessageCircle className="h-4 w-4" />
            Mensagens
            {unreadMessages > 0 && (
              <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
                {unreadMessages}
              </span>
            )}
          </button>
          <button
            onClick={onSupport}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors duration-150"
          >
            <LifeBuoy className="h-4 w-4" />
            Suporte
          </button>
        </div>
      </nav>
      {currentUser && (
        <div className="p-3 border-t border-border">
          <div className="flex items-start gap-3 mb-2">
            <Avatar className="h-10 w-10 shrink-0">
              {currentUser.foto_url ? (
                <AvatarImage src={currentUser.foto_url} alt={currentUser.nome_completo} />
              ) : null}
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
              {/* Online status with popover */}
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
                            {user.fotoUrl ? (
                              <AvatarImage src={user.fotoUrl} alt={user.nome} />
                            ) : null}
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                              {getInitials(user.nome)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{user.nome}</p>
                            {user.cargo && (
                              <p className="text-[10px] text-muted-foreground truncate">{user.cargo}</p>
                            )}
                          </div>
                          <Circle className="h-2 w-2 fill-green-500 text-green-500 shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              {currentUser.telefone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{currentUser.telefone}</span>
                </p>
              )}
              {currentUser.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{currentUser.email}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={onProfile}>
              <UserCircle className="h-3.5 w-3.5" />Meu Perfil
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" />Sair
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
