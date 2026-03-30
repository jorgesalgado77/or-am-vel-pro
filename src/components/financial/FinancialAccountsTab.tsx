import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { Search, RefreshCw, Plus, Pencil, Trash2, CheckCircle2, Receipt } from "lucide-react";
import { STATUS_MAP, type FinancialAccount } from "@/hooks/useFinancialData";

interface Props {
  accounts: FinancialAccount[];
  search: string;
  setSearch: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (acc: FinancialAccount) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
}

export const FinancialAccountsTab = React.memo(function FinancialAccountsTab({
  accounts, search, setSearch, filterStatus, setFilterStatus,
  onRefresh, onAdd, onEdit, onDelete, onMarkPaid,
}: Props) {
  const filtered = accounts.filter(a => {
    if (filterStatus !== "todos" && a.status !== filterStatus) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
        <Button size="sm" onClick={onAdd} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova Conta
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma conta cadastrada</p>
                  </TableCell>
                </TableRow>
              ) : filtered.map(acc => {
                const st = STATUS_MAP[acc.status] || STATUS_MAP.pendente;
                return (
                  <TableRow key={acc.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{acc.name}</p>
                      {acc.description && <p className="text-xs text-muted-foreground">{acc.description}</p>}
                    </TableCell>
                    <TableCell><span className="text-sm">{acc.category || "—"}</span></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(acc.amount)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{format(new Date(acc.due_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell><Badge variant="outline" className={st.color}>{st.label}</Badge></TableCell>
                    <TableCell>
                      {acc.is_fixed ? (
                        <Badge variant="secondary" className="text-[10px]">Fixo • {acc.recurrence_type || "mensal"}</Badge>
                      ) : <span className="text-xs text-muted-foreground">Variável</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {acc.status !== "pago" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => onMarkPaid(acc.id)} title="Marcar como pago">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(acc)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(acc.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
});
