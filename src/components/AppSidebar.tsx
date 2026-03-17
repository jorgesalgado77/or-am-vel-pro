import { Users, Calculator, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const navItems = [
  { id: "clients", label: "Clientes", icon: Users },
  { id: "simulator", label: "Simulador", icon: Calculator },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <aside className="w-60 border-r border-border bg-card flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground tracking-tight">
          INOVAMAD
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gestão & Financiamento</p>
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
