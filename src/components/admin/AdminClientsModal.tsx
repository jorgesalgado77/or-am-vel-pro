import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, FileText, ExternalLink } from "lucide-react";

interface ClientRow {
  id: string;
  nome: string;
  numero_orcamento: string | null;
  valor_contrato: number;
  status: string;
  tenant_id: string;
  loja_nome: string;
  codigo_loja: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenants: { id: string; nome_loja: string; codigo_loja: string | null; ativo: boolean }[];
}

export function AdminClientsModal({ open, onOpenChange, tenants }: Props) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    loadClients();
  }, [open]);

  const loadClients = async () => {
    setLoading(true);
    const activeTenantIds = tenants.filter(t => t.ativo).map(t => t.id);
    if (activeTenantIds.length === 0) { setLoading(false); return; }

    const { data } = await supabase
      .from("clients")
      .select("id, nome, numero_orcamento, status, tenant_id, created_at")
      .in("tenant_id", activeTenantIds)
      .order("created_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

    // Get last simulation valor_com_desconto for each client
    const clientIds = data.map(c => c.id);
    let simMap: Record<string, number> = {};
    if (clientIds.length > 0) {
      const { data: sims } = await supabase
        .from("simulations")
        .select("client_id, valor_tela, desconto1, desconto2, desconto3")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false });

      if (sims) {
        sims.forEach(s => {
          if (!simMap[s.client_id]) {
            const vt = Number(s.valor_tela) || 0;
            const d1 = Number(s.desconto1) || 0;
            const d2 = Number(s.desconto2) || 0;
            const d3 = Number(s.desconto3) || 0;
            const after1 = vt * (1 - d1 / 100);
            const after2 = after1 * (1 - d2 / 100);
            simMap[s.client_id] = after2 * (1 - d3 / 100);
          }
        });
      }
    }

    const mapped: ClientRow[] = data.map(c => ({
      id: c.id,
      nome: c.nome,
      numero_orcamento: c.numero_orcamento,
      valor_contrato: simMap[c.id] || 0,
      status: c.status || "novo",
      tenant_id: c.tenant_id,
      loja_nome: tenantMap[c.tenant_id]?.nome_loja || "—",
      codigo_loja: tenantMap[c.tenant_id]?.codigo_loja || "—",
      created_at: c.created_at,
    }));

    setClients(mapped);
    setLoading(false);
  };

  const filtered = clients.filter(c =>
    !search ||
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.loja_nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.numero_orcamento || "").includes(search)
  );

  const grouped = filtered.reduce<Record<string, ClientRow[]>>((acc, c) => {
    if (!acc[c.tenant_id]) acc[c.tenant_id] = [];
    acc[c.tenant_id].push(c);
    return acc;
  }, {});

  const statusLabels: Record<string, string> = {
    novo: "Novo",
    em_negociacao: "Em Negociação",
    venda_fechada: "Venda Fechada",
    perdido: "Perdido",
  };

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    novo: "outline",
    em_negociacao: "secondary",
    venda_fechada: "default",
    perdido: "destructive",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" />
            Clientes Cadastrados ({clients.length})
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, loja ou nº orçamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([tenantId, tenantClients]) => (
              <div key={tenantId} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">{tenantClients[0].codigo_loja}</Badge>
                  <span className="font-semibold text-sm text-foreground">{tenantClients[0].loja_nome}</span>
                  <Badge variant="secondary" className="ml-auto">{tenantClients.length} cliente(s)</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Nº Contrato</TableHead>
                      <TableHead className="text-right">Valor (à vista)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantClients.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="font-mono text-xs">{c.numero_orcamento || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {c.valor_contrato > 0
                            ? `R$ ${c.valor_contrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[c.status] || "outline"}>
                            {statusLabels[c.status] || c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver contrato">
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
