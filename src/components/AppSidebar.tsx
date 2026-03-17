import { Users, Calculator, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/hooks/useCompanySettings";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const navItems = [
  { id: "clients", label: "Clientes", icon: Users },
  { id: "simulator", label: "Simulador", icon: Calculator },
  { id: "settings", label: "Configurações", icon: Settings },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { settings } = useCompanySettings();

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
        {navItems.map((item) => (
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
    </aside>
  );
}
