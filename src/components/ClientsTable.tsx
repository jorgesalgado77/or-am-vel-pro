import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Search, Calculator } from "lucide-react";
import { useState } from "react";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface ClientsTableProps {
  clients: Client[];
  loading: boolean;
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSimulate: (client: Client) => void;
}

export function ClientsTable({ clients, loading, onEdit, onDelete, onAdd, onSimulate }: ClientsTableProps) {
  const [search, setSearch] = useState("");

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.cpf || "").toLowerCase().includes(q) ||
      (c.vendedor || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-md bg-card overflow-hidden flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead className="font-medium">Nome</TableHead>
              <TableHead className="font-medium">CPF</TableHead>
              <TableHead className="font-medium">Telefone</TableHead>
              <TableHead className="font-medium">Email</TableHead>
              <TableHead className="font-medium">Ambientes</TableHead>
              <TableHead className="font-medium">Vendedor</TableHead>
              <TableHead className="font-medium w-[120px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => (
                <TableRow key={client.id} className="hover:bg-secondary/30 transition-colors duration-150">
                  <TableCell className="font-medium text-foreground">{client.nome}</TableCell>
                  <TableCell className="text-foreground tabular-nums">{client.cpf || "—"}</TableCell>
                  <TableCell className="text-foreground tabular-nums">{client.telefone1 || "—"}</TableCell>
                  <TableCell className="text-foreground">{client.email || "—"}</TableCell>
                  <TableCell className="text-foreground">{client.quantidade_ambientes || 0}</TableCell>
                  <TableCell className="text-foreground">{client.vendedor || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onSimulate(client)} title="Simular">
                        <Calculator className="h-4 w-4" />
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
