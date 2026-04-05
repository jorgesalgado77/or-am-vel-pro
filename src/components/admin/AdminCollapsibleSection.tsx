import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface AdminCollapsibleSectionProps {
  title: string;
  icon?: React.ElementType;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function AdminCollapsibleSection({ title, icon: Icon, children, defaultOpen = true }: AdminCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group mb-2"
      >
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <div className="flex-1 border-t border-border mx-2" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {open ? "Ocultar" : "Exibir"}
        </span>
      </button>
      {open && children}
    </div>
  );
}
