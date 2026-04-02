import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Calculator, Clock, RefreshCw, Filter, X, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface SimulationWithClient {
  id: string;
  client_id: string;
  client_name: string;
  numero_orcamento: string | null;
  valor_tela: number;
  valor_final: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  forma_pagamento: string;
  parcelas: number;
  valor_entrada: number;
  valor_parcela: number;
  plus_percentual: number;
  arquivo_nome: string | null;
  estrategia_ia: string | null;
  created_at: string;
}

interface LoadSimulationModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (simulation: SimulationWithClient) => void;
}

const FORMA_LABELS: Record<string, string> = {
  "A vista": "À Vista",
  Pix: "Pix",
  Credito: "Cartão de Crédito",
  Boleto: "Boleto",
  "Credito / Boleto": "Crédito + Boleto",
  "Entrada e Entrega": "Entrada e Entrega",
};

const PAGE_SIZE = 10;

export function LoadSimulationModal({ open, onClose, onSelect }: LoadSimulationModalProps) {
  const { currentUser } = useCurrentUser();
  const [simulations, setSimulations] = useState<SimulationWithClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searchOrcamento, setSearchOrcamento] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SimulationWithClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdminOrManager = useMemo(() => {
    const cargo = currentUser?.cargo_nome?.toLowerCase() || "";
    return cargo === "administrador" || cargo === "gerente";
  }, [currentUser]);

  const loadSimulations = async () => {
    if (!open) return;
    setLoading(true);

    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    let query = supabase
      .from("simulations")
      .select("*, clients!inner(nome, numero_orcamento, vendedor, projetista_id)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (!isAdminOrManager && currentUser) {
      query = query.or(
        `clients.vendedor.eq.${currentUser.nome_completo},clients.projetista_id.eq.${currentUser.id}`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("[LoadSimulationModal] Error:", error);
      setSimulations([]);
    } else {
      const mapped: SimulationWithClient[] = (data || []).map((s: any) => ({
        id: s.id,
        client_id: s.client_id,
        client_name: s.clients?.nome || "Sem nome",
        numero_orcamento: s.clients?.numero_orcamento || null,
        valor_tela: Number(s.valor_tela) || 0,
        valor_final: Number(s.valor_final) || 0,
        desconto1: Number(s.desconto1) || 0,
        desconto2: Number(s.desconto2) || 0,
        desconto3: Number(s.desconto3) || 0,
        forma_pagamento: s.forma_pagamento || "A vista",
        parcelas: s.parcelas || 1,
        valor_entrada: Number(s.valor_entrada) || 0,
        valor_parcela: Number(s.valor_parcela) || 0,
        plus_percentual: Number(s.plus_percentual) || 0,
        arquivo_nome: s.arquivo_nome,
        created_at: s.created_at,
      }));
      setSimulations(mapped);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      loadSimulations();
      setSearchName("");
      setSearchOrcamento("");
      setDateFilter("all");
      setCurrentPage(1);
    }
  }, [open]);

  const filtered = useMemo(() => {
    let list = simulations;

    if (searchName.trim()) {
      const term = searchName.toLowerCase().trim();
      list = list.filter(s => s.client_name.toLowerCase().includes(term));
    }

    if (searchOrcamento.trim()) {
      const term = searchOrcamento.toLowerCase().trim();
      list = list.filter(s => (s.numero_orcamento || "").toLowerCase().includes(term));
    }

    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      let cutoffEnd: Date | null = null;
      switch (dateFilter) {
        case "7d": cutoff = new Date(now.getTime() - 7 * 86400000); break;
        case "30d": cutoff = new Date(now.getTime() - 30 * 86400000); break;
        case "90d": cutoff = new Date(now.getTime() - 90 * 86400000); break;
        case "prev_month": {
          const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          cutoff = firstOfPrevMonth;
          cutoffEnd = firstOfThisMonth;
          break;
        }
        default: cutoff = new Date(0);
      }
      list = list.filter(s => {
        const d = new Date(s.created_at);
        if (cutoffEnd) return d >= cutoff && d < cutoffEnd;
        return d >= cutoff;
      });
    }

    return list;
  }, [simulations, searchName, searchOrcamento, dateFilter]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchName, searchOrcamento, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const clearFilters = () => {
    setSearchName("");
    setSearchOrcamento("");
    setDateFilter("all");
  };

  const hasFilters = searchName || searchOrcamento || dateFilter !== "all";

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("simulations").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir simulação");
      console.error("[LoadSimulationModal] Delete error:", error);
    } else {
      toast.success("Simulação excluída com sucesso");
      setSimulations(prev => prev.filter(s => s.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
    setDeleting(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-primary" />
              Carregar Simulação
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome do cliente..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Nº orçamento..."
                  value={searchOrcamento}
                  onChange={(e) => setSearchOrcamento(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 text-xs w-[130px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="prev_month">Mês anterior</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <Calculator className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {simulations.length === 0 ? "Nenhuma simulação encontrada" : "Nenhum resultado para os filtros aplicados"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[340px]">
              <div className="space-y-2 pr-2">
                {paginatedItems.map(sim => (
                  <Card
                    key={sim.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => { onSelect(sim); onClose(); }}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                          {sim.client_name}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {format(new Date(sim.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </span>
                          {isAdminOrManager && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(sim); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px]">
                          {FORMA_LABELS[sim.forma_pagamento] || sim.forma_pagamento}
                        </Badge>
                        {sim.numero_orcamento && (
                          <Badge variant="secondary" className="text-[9px]">
                            #{sim.numero_orcamento}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Valor de Tela</p>
                          <p className="text-xs font-medium">{formatCurrency(sim.valor_tela)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-muted-foreground">Valor Final</p>
                          <p className="text-sm font-bold text-primary">{formatCurrency(sim.valor_final)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{sim.parcelas}x de {formatCurrency(sim.valor_parcela)}</span>
                        <span>Desc: {sim.desconto1}%+{sim.desconto2}%+{sim.desconto3}%</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Pagination + Footer */}
          <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
            <span>{filtered.length} simulação(ões)</span>
            <div className="flex items-center gap-1">
              {totalPages > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="px-2 text-xs">{currentPage}/{totalPages}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadSimulations}>
                <RefreshCw className="h-3 w-3" /> Atualizar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir simulação</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir a simulação de <strong>{deleteTarget?.client_name}</strong> criada em{" "}
              {deleteTarget ? format(new Date(deleteTarget.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ""}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
