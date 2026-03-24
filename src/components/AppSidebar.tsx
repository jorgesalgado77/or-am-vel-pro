import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Calculator, Settings, LogOut, Phone, Mail, LayoutDashboard, LifeBuoy,
  MessageCircle, Receipt, CreditCard, Circle, Bot, Video, UserCircle, Megaphone,
  BookOpen, Gift, Wallet, PanelLeftClose, PanelLeft, Sun, Moon, Monitor, GraduationCap,
  Box, Loader2, Bell,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import type { OnlineUser } from "@/hooks/useOnlinePresence";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onChangePassword?: () => void;
  onSupport?: () => void;
  onProfile?: () => void;
  unreadMessages?: number;
  onlineUsers?: OnlineUser[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABELS = { light: "Claro", dark: "Escuro", system: "Automático" } as const;

export function AppSidebar({
  activeView, onViewChange, onChangePassword, onSupport, onProfile,
  unreadMessages = 0, onlineUsers = [], collapsed, onToggleCollapse,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const { currentUser, logout, hasPermission } = useCurrentUser();
  const { mode, cycleTheme } = useTheme();
  const [notifications, setNotifications] = useState<Array<{ id: string; conteudo: string; created_at: string; lido: boolean }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const isAdmin = currentUser?.cargo_nome?.toUpperCase().includes("ADMINISTRADOR") || currentUser?.cargo_nome?.toUpperCase().includes("ADMIN");
  const ThemeIcon = THEME_ICONS[mode];
  const companyName = settings.company_name || "OrçaMóvel PRO";
  const companySubtitle = settings.company_subtitle || "Orce. Venda. Simplifique";

  // Fetch notification history (leads received)
  useEffect(() => {
    const userName = currentUser?.nome_completo;
    if (!userName) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("tracking_messages" as any)
        .select("id, conteudo, created_at")
        .eq("destinatario", userName)
        .eq("tipo", "sistema")
        .ilike("conteudo", "%enviado para seu atendimento%")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) {
        const readIds = JSON.parse(localStorage.getItem("read_notifications") || "[]");
        setNotifications((data as any[]).map(n => ({ ...n, lido: readIds.includes(n.id) })));
      }
    };
    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel("sidebar-notifications")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "tracking_messages" }, (payload: any) => {
        const msg = payload.new;
        if (msg?.destinatario === userName && msg?.tipo === "sistema" && msg?.conteudo?.includes("enviado para seu atendimento")) {
          setNotifications(prev => [{ id: msg.id, conteudo: msg.conteudo, created_at: msg.created_at, lido: false }, ...prev.slice(0, 19)]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.nome_completo]);

  const unreadNotifications = notifications.filter(n => !n.lido).length;

  const markAllRead = () => {
    const ids = notifications.map(n => n.id);
    localStorage.setItem("read_notifications", JSON.stringify(ids));
    setNotifications(prev => prev.map(n => ({ ...n, lido: true })));
  };

    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "clientes" as const, show: true, badge: null },
    { id: "clients", label: "Clientes", icon: Users, perm: "clientes" as const, show: true, badge: null },
    { id: "simulator", label: "Negociação", icon: Calculator, perm: "simulador" as const, show: true, badge: null },
    { id: "payroll", label: "Folha de Pagamento", icon: Receipt, perm: "folha_pagamento" as const, show: hasPermission("folha_pagamento"), badge: null },
    { id: "financial", label: "Financeiro", icon: Wallet, perm: "financeiro" as const, show: hasPermission("financeiro"), badge: "NOVO" },
    { id: "plans", label: "Planos de Assinatura", icon: CreditCard, perm: "planos" as const, show: hasPermission("planos"), badge: null },
    { id: "funnel", label: "Funil de Captação", icon: Megaphone, perm: "funil" as const, show: hasPermission("funil"), badge: null },
    { id: "campaigns", label: "Campanhas", icon: BookOpen, perm: "campanhas" as const, show: hasPermission("campanhas"), badge: "NOVO" },
    { id: "referrals", label: "Indicações", icon: Gift, perm: "indicacoes" as const, show: hasPermission("indicacoes"), badge: "NOVO" },
    { id: "vendazap", label: "VendaZap AI", icon: Bot, perm: "vendazap" as const, show: hasPermission("vendazap"), badge: "ADD-ON" },
    { id: "vendazap-chat", label: "Chat Vendas", icon: MessageCircle, perm: "chat_vendas" as const, show: hasPermission("chat_vendas"), badge: "ADD-ON" },
    { id: "dealroom", label: "Deal Room", icon: Video, perm: "dealroom" as const, show: hasPermission("dealroom"), badge: "ADD-ON" },
    { id: "smart3d", label: "3D Smart Import", icon: Box, perm: "smart3d" as const, show: hasPermission("smart3d"), badge: "ADD-ON" },
    { id: "tutorials", label: "Tutoriais", icon: GraduationCap, perm: "clientes" as const, show: true, badge: null },
  ];

  const bottomItems = [
    {
      id: "messages", label: "Mensagens", icon: MessageCircle, show: hasPermission("mensagens"),
      badge: unreadMessages > 0 ? unreadMessages : null,
    },
    { id: "settings", label: "Configurações", icon: Settings, show: isAdmin && hasPermission("configuracoes") },
  ];

  const NavButton = ({ id, label, icon: Icon, badge: itemBadge, destructive, onClick }: {
    id?: string; label: string; icon: any; badge?: any; destructive?: boolean; onClick?: () => void;
  }) => {
    const isActive = id ? activeView === id : false;
    const handleClick = onClick ?? (() => id && onViewChange(id));

    const content = (
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150",
          collapsed && "justify-center px-2",
          destructive && "text-destructive hover:bg-destructive/10",
          !destructive && isActive && "bg-primary/10 text-primary",
          !destructive && !isActive && "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-300", collapsed && "scale-110")} />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && itemBadge && typeof itemBadge === "number" && (
          <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
            {itemBadge}
          </span>
        )}
        {!collapsed && itemBadge && typeof itemBadge === "string" && (
          <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4 font-bold bg-primary/10 text-primary border-primary/20">
            {itemBadge}
          </Badge>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return content;
  };

  return (
    <aside
      className={cn(
        "border-r border-border bg-card flex flex-col h-screen fixed left-0 top-0 overflow-hidden transition-all duration-300 z-30",
        collapsed ? "w-[60px]" : "w-60",
      )}
    >
      {/* Header */}
      <div className={cn("p-3 border-b border-border flex items-center gap-3", collapsed && "justify-center")}>
        {settings.logo_url && (
          <img src={settings.logo_url} alt="Logo" className="h-8 w-auto object-contain shrink-0" />
        )}
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground tracking-tight truncate">{companyName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{companySubtitle}</p>
          </div>
        )}
      </div>

      {/* Toggle + Theme row */}
      <div className={cn("flex items-center border-b border-border", collapsed ? "flex-col gap-1 py-2" : "justify-between px-2 py-1.5")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onToggleCollapse}>
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{collapsed ? "Expandir menu" : "Recolher menu"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={cycleTheme}>
              <ThemeIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Tema: {THEME_LABELS[mode]}</TooltipContent>
        </Tooltip>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: "none" }}>
        {navItems
          .filter((item) => item.show && hasPermission(item.perm))
          .map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} badge={item.badge} />
          ))}

        <div className="pt-2 border-t border-border mx-1 space-y-0.5 mt-4">
          {hasPermission("divulgue_ganhe") && <NavButton label="Divulgue e Ganhe" icon={Gift} badge="NOVO" onClick={() => navigate("/afiliado")} />}
          {bottomItems.filter(i => i.show).map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} badge={item.badge} />
          ))}
          {hasPermission("suporte") && <NavButton label="Suporte" icon={LifeBuoy} onClick={onSupport} />}
          <NavButton label="Sair" icon={LogOut} destructive onClick={async () => { await logout(); navigate("/"); }} />
        </div>
      </nav>

      {/* User profile section */}
      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
        {!currentUser ? (
          /* Loading skeleton while profile resolves */
          collapsed ? (
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
          )
        ) : collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onProfile} className="focus:outline-none">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer">
                    {currentUser.foto_url ? (
                      <AvatarImage src={currentUser.foto_url} alt={currentUser.nome_completo} />
                    ) : null}
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
        ) : (
          <>
            <div className="flex items-start gap-3 mb-2">
              <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/20">
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
        )}
      </div>
    </aside>
  );
}
