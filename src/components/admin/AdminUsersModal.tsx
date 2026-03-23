import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";

interface UserRow {
  id: string;
  nome_completo: string;
  cargo_nome: string | null;
  telefone: string | null;
  email: string | null;
  tipo_regime: string | null;
  salario_fixo: number;
  comissao_percentual: number;
  tenant_id: string;
  loja_nome: string;
  codigo_loja: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenants: { id: string; nome_loja: string; codigo_loja: string | null; ativo: boolean }[];
}

export function AdminUsersModal({ open, onOpenChange, tenants }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    loadUsers();
  }, [open]);

  const loadUsers = async () => {
    setLoading(true);
    const activeTenantIds = tenants.filter(t => t.ativo).map(t => t.id);
    if (activeTenantIds.length === 0) { setLoading(false); return; }

    const { data } = await supabase
      .from("usuarios")
      .select("id, nome_completo, telefone, email, tipo_regime, salario_fixo, comissao_percentual, tenant_id, cargo_id, ativo")
      .in("tenant_id", activeTenantIds)
      .eq("ativo", true);

    if (!data) { setLoading(false); return; }

    // Get cargo names
    const cargoIds = [...new Set(data.filter(u => u.cargo_id).map(u => u.cargo_id!))];
    let cargoMap: Record<string, string> = {};
    if (cargoIds.length > 0) {
      const { data: cargos } = await supabase.from("cargos").select("id, nome").in("id", cargoIds);
      if (cargos) cargos.forEach(c => { cargoMap[c.id] = c.nome; });
    }

    const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

    const mapped: UserRow[] = data.map(u => ({
      id: u.id,
      nome_completo: u.nome_completo,
      cargo_nome: u.cargo_id ? cargoMap[u.cargo_id] || null : null,
      telefone: u.telefone,
      email: u.email,
      tipo_regime: u.tipo_regime,
      salario_fixo: Number(u.salario_fixo) || 0,
      comissao_percentual: Number(u.comissao_percentual) || 0,
      tenant_id: u.tenant_id,
      loja_nome: tenantMap[u.tenant_id]?.nome_loja || "—",
      codigo_loja: tenantMap[u.tenant_id]?.codigo_loja || "—",
    }));

    setUsers(mapped);
    setLoading(false);
  };

  const filtered = users.filter(u =>
    !search ||
    u.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
    u.loja_nome.toLowerCase().includes(search.toLowerCase()) ||
    u.codigo_loja.includes(search)
  );

  // Group by tenant
  const grouped = filtered.reduce<Record<string, UserRow[]>>((acc, u) => {
    const key = u.tenant_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(u);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Usuários Ativos ({users.length})
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, loja ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([tenantId, tenantUsers]) => (
              <div key={tenantId} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">{tenantUsers[0].codigo_loja}</Badge>
                  <span className="font-semibold text-sm text-foreground">{tenantUsers[0].loja_nome}</span>
                  <Badge variant="secondary" className="ml-auto">{tenantUsers.length} usuário(s)</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Regime</TableHead>
                      <TableHead className="text-right">Salário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantUsers.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.nome_completo}</TableCell>
                        <TableCell>{u.cargo_nome || "—"}</TableCell>
                        <TableCell className="text-xs">{u.telefone || "—"}</TableCell>
                        <TableCell className="text-xs">{u.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={u.tipo_regime === "CLT" ? "default" : u.tipo_regime === "MEI" ? "secondary" : "outline"}>
                            {u.tipo_regime || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          R$ {u.salario_fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
