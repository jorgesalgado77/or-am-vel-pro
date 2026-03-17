import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search, Calculator, History, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { format, addDays, isPast } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  created_at: string;
}

interface ClientsTableProps {
  clients: Client[];
  loading: boolean;
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSimulate: (client: Client) => void;
  onHistory: (client: Client) => void;
}

export function ClientsTable({ clients, loading, onEdit, onDelete, onAdd, onSimulate, onHistory }: ClientsTableProps) {
  const [search, setSearch] = useState("");
  const [lastSims, setLastSims] = useState<Record<string, LastSimInfo>>({});
  const { settings } = useCompanySettings();

  useEffect(() => {
    if (clients.length === 0) return;
    // Fetch last simulation per client
    const fetchLastSims = async () => {
      const { data } = await supabase
        .from("simulations")
        .select("client_id, valor_final, created_at")
        .order("created_at", { ascending: false });
      if (!data) return;
      const map: Record<string, LastSimInfo> = {};
      data.forEach((s) => {
        if (!map[s.client_id]) {
          map[s.client_id] = { valor_final: Number(s.valor_final) || 0, created_at: s.created_at };
        }
      });
      setLastSims(map);
    };
    fetchLastSims();
  }, [clients]);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.cpf || "").toLowerCase().includes(q) ||
      (c.vendedor || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  const isExpired = (createdAt: string) => {
    const expiryDate = addDays(new Date(createdAt), settings.budget_validity_days);
    return isPast(expiryDate);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar clientes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={onAdd} className="gap-2"><Plus className="h-4 w-4" />Novo Cliente</Button>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead className="font-medium">Nome</TableHead>
              <TableHead className="font-medium">CPF</TableHead>
              <TableHead className="font-medium">Telefone</TableHead>
              <TableHead className="font-medium">Projetista</TableHead>
              <TableHead className="font-medium">Último Orçamento</TableHead>
              <TableHead className="font-medium">Validade</TableHead>
              <TableHead className="font-medium w-[150px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => {
                const sim = lastSims[client.id];
                const expired = sim ? isExpired(sim.created_at) : false;
                return (
                  <TableRow key={client.id} className={`hover:bg-secondary/30 transition-colors duration-150 ${expired ? "bg-destructive/5" : ""}`}>
                    <TableCell className="font-medium text-foreground">{client.nome}</TableCell>
                    <TableCell className="text-foreground tabular-nums">{client.cpf || "—"}</TableCell>
                    <TableCell className="text-foreground tabular-nums">{client.telefone1 || "—"}</TableCell>
                    <TableCell className="text-foreground">{client.vendedor || "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {sim ? (
                        <span className={expired ? "text-destructive font-medium" : "text-foreground font-medium"}>
                          {formatCurrency(sim.valor_final)}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {sim ? (
                        expired ? (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3" />Expirado
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Até {format(addDays(new Date(sim.created_at), settings.budget_validity_days), "dd/MM/yyyy")}
                          </span>
                        )
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onSimulate(client)} title="Simular">
                          <Calculator className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onHistory(client)} title="Histórico">
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(client)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(client.id)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
