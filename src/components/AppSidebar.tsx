import { Users, Calculator, Settings, LogOut, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const navItems = [
  { id: "clients", label: "Clientes", icon: Users, perm: "clientes" as const },
  { id: "simulator", label: "Simulador", icon: Calculator, perm: "simulador" as const },
  { id: "settings", label: "Configurações", icon: Settings, perm: "configuracoes" as const },
];

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { settings } = useCompanySettings();
  const { currentUser, logout, hasPermission } = useCurrentUser();

  return (
    <aside className="w-60 border-r border-border bg-card flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-border flex items-center gap-3">
        {settings.logo_url && (
          <img src={settings.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
        )}
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            {settings.company_name}
          </h1>
          {settings.company_subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{settings.company_subtitle}</p>
          )}
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems
          .filter((item) => hasPermission(item.perm))
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
              {item.label}
            </button>
          ))}
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
          <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={logout}>
            <LogOut className="h-3 w-3" />Trocar Usuário
          </Button>
        </div>
      )}
    </aside>
  );
}
