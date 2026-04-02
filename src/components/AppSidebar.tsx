import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Calculator, Settings, LogOut, Phone, Mail, LayoutDashboard, LifeBuoy,
  MessageSquare, Receipt, CreditCard, BrainCircuit, Video, Megaphone,
  BookOpen, Gift, Wallet, PanelLeftClose, PanelLeft, Sun, Moon, Monitor, GraduationCap,
  Box, ClipboardCheck, Ruler, Package, UserCircle, Sparkles, ShieldCheck,
} from "lucide-react";
import { PushNotificationToggle } from "@/components/tasks/PushNotificationToggle";

import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { usePendingMeasurements } from "@/hooks/usePendingMeasurements";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import { SidebarNotifications } from "@/components/sidebar/SidebarNotifications";
import { SidebarUserProfile } from "@/components/sidebar/SidebarUserProfile";
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

  const tenantId = (currentUser as any)?.tenant_id || null;
  const { notifications, unreadCount: unreadNotifications, markAsRead, markAllRead } = useNotificationCenter(
    currentUser?.id, currentUser?.nome_completo, tenantId
  );

  const isAdmin = currentUser?.cargo_nome?.toUpperCase().includes("ADMINISTRADOR") || currentUser?.cargo_nome?.toUpperCase().includes("ADMIN");
  const cargoLower = currentUser?.cargo_nome?.toLowerCase() || "";
  const ThemeIcon = THEME_ICONS[mode];
  const companyName = settings.company_name || "OrçaMóvel PRO";
  const companySubtitle = settings.company_subtitle || "Orce. Venda. Simplifique";
  const pendingMeasurements = usePendingMeasurements(currentUser?.id, currentUser?.cargo_nome || undefined);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "clientes" as const, show: true, badge: null },
    { id: "commercial-ai", label: "IA Gerente", icon: BrainCircuit, perm: "ia_gerente" as const, show: hasPermission("ia_gerente"), badge: "NOVO" },
    { id: "clients", label: "Clientes", icon: Users, perm: "clientes" as const, show: hasPermission("clientes"), badge: null },
    { id: "catalog", label: "Catálogo", icon: Package, perm: "catalogo" as const, show: hasPermission("catalogo"), badge: "NOVO" },
    { id: "simulator", label: "Negociação", icon: Calculator, perm: "simulador" as const, show: true, badge: null },
    { id: "measurements", label: "Medidas", icon: Ruler, perm: "medicao" as const, show: hasPermission("medicao") || cargoLower.includes("gerente") || cargoLower.includes("tecnico") || cargoLower.includes("técnico") || cargoLower.includes("administrador") || cargoLower.includes("liberador") || cargoLower.includes("conferente"), badge: pendingMeasurements > 0 ? pendingMeasurements : null },
    { id: "liberacao", label: "Liberação", icon: ShieldCheck, perm: "clientes" as const, show: true, badge: null },
    { id: "tasks", label: "Tarefas", icon: ClipboardCheck, perm: "clientes" as const, show: true, badge: null },
    { id: "emails", label: "Email", icon: Mail, perm: "email" as const, show: hasPermission("email"), badge: "NOVO" },
    { id: "messages", label: "Mensagens", icon: MessageSquare, perm: "mensagens" as const, show: hasPermission("mensagens"), badge: unreadMessages > 0 ? unreadMessages : null },
    { id: "vendazap", label: "VendaZap AI", icon: Sparkles, perm: "vendazap" as const, show: hasPermission("vendazap"), badge: "ADD-ON" },
    { id: "vendazap-chat", label: "Chat Vendas", icon: Phone, perm: "chat_vendas" as const, show: hasPermission("chat_vendas"), badge: "ADD-ON" },
    { id: "dealroom", label: "Deal Room", icon: Video, perm: "dealroom" as const, show: hasPermission("dealroom"), badge: "ADD-ON" },
    { id: "smart3d", label: "3D Smart Import", icon: Box, perm: "smart3d" as const, show: hasPermission("smart3d"), badge: "ADD-ON" },
    { id: "funnel", label: "Funil de Captação", icon: Megaphone, perm: "funil" as const, show: hasPermission("funil"), badge: null },
    { id: "campaigns", label: "Campanhas", icon: BookOpen, perm: "campanhas" as const, show: hasPermission("campanhas"), badge: "NOVO" },
    { id: "financial", label: "Financeiro", icon: Wallet, perm: "financeiro" as const, show: hasPermission("financeiro"), badge: "NOVO" },
    { id: "referrals", label: "Indicações", icon: Gift, perm: "indicacoes" as const, show: hasPermission("indicacoes"), badge: "NOVO" },
    { id: "tutorials", label: "Tutoriais", icon: GraduationCap, perm: "tutoriais" as const, show: hasPermission("tutoriais"), badge: null },
  ];

  const bottomItems = [
    { id: "settings", label: "Configurações", icon: Settings, show: isAdmin || hasPermission("configuracoes"), badge: null as any },
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
        )}
        style={{
          color: destructive
            ? "hsl(0 72% 60%)"
            : isActive
              ? "hsl(var(--sidebar-primary))"
              : "hsl(var(--sidebar-foreground))",
          backgroundColor: isActive
            ? "hsl(var(--sidebar-accent))"
            : undefined,
          opacity: !destructive && !isActive ? 0.75 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = "hsl(var(--sidebar-accent))";
            e.currentTarget.style.opacity = "1";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.opacity = "0.75";
          }
        }}
      >
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-300", collapsed && "scale-110")} />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && itemBadge && typeof itemBadge === "number" && (
          <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
            {itemBadge}
          </span>
        )}
        {!collapsed && itemBadge && typeof itemBadge === "string" && (
          <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4 font-bold" style={{ backgroundColor: "hsl(var(--sidebar-accent))", color: "hsl(var(--sidebar-primary))" }}>
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
        "border-r flex flex-col h-screen fixed left-0 top-0 overflow-hidden transition-all duration-300",
        "max-md:z-40 max-md:shadow-2xl md:z-30",
        collapsed
          ? "max-md:-translate-x-full max-md:w-64 md:w-[60px]"
          : "max-md:w-64 max-md:translate-x-0 md:w-60",
      )}
      style={{
        backgroundColor: "hsl(var(--sidebar-background))",
        color: "hsl(var(--sidebar-foreground))",
        borderColor: "hsl(var(--sidebar-border))",
      }}
    >
      {/* Header */}
      <div className={cn("p-3 border-b flex items-center gap-3", collapsed && "justify-center")} style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        {settings.logo_url && (
          <img src={settings.logo_url} alt="Logo" className="h-8 w-auto object-contain shrink-0" />
        )}
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate" style={{ color: "hsl(var(--sidebar-foreground))" }}>{companyName}</h1>
            <p className="text-xs mt-0.5 truncate" style={{ color: "hsl(var(--sidebar-foreground) / 0.6)" }}>{companySubtitle}</p>
          </div>
        )}
      </div>

      {/* Toggle + Theme row */}
      <div className={cn("flex items-center", collapsed ? "flex-col gap-1 py-2" : "justify-between px-2 py-1.5")} style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" style={{ color: "hsl(var(--sidebar-foreground) / 0.7)" }} onClick={onToggleCollapse}>
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{collapsed ? "Expandir menu" : "Recolher menu"}</TooltipContent>
        </Tooltip>

        <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
          <SidebarNotifications
            notifications={notifications}
            unreadCount={unreadNotifications}
            markAsRead={markAsRead}
            markAllRead={markAllRead}
            onNavigate={onViewChange}
            collapsed={collapsed}
          />

          <PushNotificationToggle tenantId={tenantId} userId={currentUser?.id} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={cycleTheme}>
                <ThemeIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Tema: {THEME_LABELS[mode]}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: "none" }}>
        {navItems
          .filter((item) => item.show && hasPermission(item.perm))
          .map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} badge={item.badge} />
          ))}

        <div className="pt-2 mx-1 space-y-0.5 mt-4" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}>
          {hasPermission("divulgue_ganhe") && <NavButton label="Divulgue e Ganhe" icon={Gift} badge="NOVO" onClick={() => navigate("/afiliado")} />}
          {bottomItems.filter(i => i.show).map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} badge={item.badge} />
          ))}
          <NavButton label="Meu Perfil" icon={UserCircle} onClick={onProfile} />
          {hasPermission("suporte") && <NavButton label="Suporte" icon={LifeBuoy} onClick={onSupport} />}
          <NavButton label="Sair" icon={LogOut} destructive onClick={async () => { await logout(); navigate("/"); }} />
        </div>
      </nav>

      {/* User profile section */}
      <div className={cn(collapsed ? "p-2" : "p-3")} style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}>
        <SidebarUserProfile
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          collapsed={collapsed}
          onProfile={onProfile}
        />
      </div>
    </aside>
  );
}
