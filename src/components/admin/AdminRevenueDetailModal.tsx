import { memo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Store, DollarSign } from "lucide-react";

interface RevenueItem {
  nome_loja: string;
  plano: string;
  plano_periodo: string;
  valor_mensal: number;
}

interface AdminRevenueDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: RevenueItem[];
  total: number;
}

export const AdminRevenueDetailModal = memo(function AdminRevenueDetailModal({
  open,
  onOpenChange,
  items,
  total,
}: AdminRevenueDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-accent" />
            Composição da Receita Mensal
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma loja ativa com plano pago no momento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Valor/Mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[180px]">{item.nome_loja}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.plano === "premium" ? "destructive" : "default"} className="text-[10px]">
                        {item.plano.charAt(0).toUpperCase() + item.plano.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.plano_periodo === "anual" ? "Anual" : "Mensal"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      R$ {item.valor_mensal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {items.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Total Receita Mensal</span>
              <span className="text-lg font-bold text-accent">
                R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
