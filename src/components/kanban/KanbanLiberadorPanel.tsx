import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, FileText, Calculator } from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import type { Client, LastSimInfo } from "./kanbanTypes";

interface Props {
  liberadorMonth: string;
  setLiberadorMonth: (v: string) => void;
  filtered: Client[];
  lastSims: Record<string, LastSimInfo>;
}

export const KanbanLiberadorPanel = React.memo(function KanbanLiberadorPanel({
  liberadorMonth, setLiberadorMonth, filtered, lastSims,
}: Props) {
  const totalContratos = filtered.length;
  const valorAcumulado = filtered.reduce(
    (sum, c) => sum + (lastSims[c.id]?.valor_com_desconto || lastSims[c.id]?.valor_final || 0), 0
  );

  return (
    <div className="flex flex-col gap-3 mb-3 p-4 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center gap-3 flex-wrap">
        <CalendarIcon className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium whitespace-nowrap">Mês de referência:</Label>
        <Input type="month" value={liberadorMonth} onChange={(e) => setLiberadorMonth(e.target.value)} className="max-w-[200px]" />
        <span className="text-xs text-muted-foreground">Contratos fechados no período selecionado</span>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground leading-none">Contratos</p>
            <p className="text-lg font-bold text-foreground">{totalContratos}</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-10" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calculator className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground leading-none">Valor Acumulado</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(valorAcumulado)}</p>
          </div>
        </div>
      </div>
    </div>
  );
});
