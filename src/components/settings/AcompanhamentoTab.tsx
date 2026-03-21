import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { useComissaoPolicy, calcularComissao } from "@/hooks/useComissaoPolicy";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS = [
  { value: "medicao", label: "Medição" },
  { value: "liberacao", label: "Liberação" },
  { value: "entrega", label: "Entrega" },
  { value: "montagem", label: "Montagem" },
  { value: "assistencia", label: "Ass.Técnica" },
  { value: "finalizado", label: "Finalizado" },
];

const STATUS_COLORS: Record<string, string> = {
  medicao: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  liberacao: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  entrega: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  montagem: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  assistencia: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  finalizado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

interface TrackingRow {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  cpf_cnpj: string | null;
  quantidade_ambientes: number;
  valor_contrato: number;
  data_fechamento: string | null;
  projetista: string | null;
  status: string;
}

export function AcompanhamentoTab() {
  const { user } = useAuth();
  const { policy } = useComissaoPolicy();
  const [trackings, setTrackings] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    numero_contrato: "",
    nome_cliente: "",
    cpf_cnpj: "",
    quantidade_ambientes: 0,
    valor_contrato: 0,
    data_fechamento: "",
    projetista: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchTrackings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_tracking")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setTrackings(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchTrackings(); }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("client_tracking")
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success("Status atualizado!");
      setTrackings((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
    }
  };

  const handleAdd = async () => {
    if (!form.numero_contrato.trim() || !form.nome_cliente.trim()) {
      toast.error("Preencha número do contrato e nome do cliente");
      return;
    }
    setSaving(true);

    // Try to find client by name
    const { data: clientData } = await supabase
      .from("clients")
      .select("id")
      .ilike("nome", `%${form.nome_cliente.trim()}%`)
      .limit(1)
      .single();

    // Calculate commission based on policy
    // GERENTE ganha sobre total de vendas da loja; outros cargos ganham por cliente
    const comissaoResult = calcularComissao(
      form.valor_contrato,
      0, // Will be resolved by cargo if needed
      policy,
      user?.cargo_id || null,
      (user as any)?.cargo_nome || null
    );

    const { error } = await supabase.from("client_tracking").insert({
      client_id: clientData?.id || "00000000-0000-0000-0000-000000000000",
      numero_contrato: form.numero_contrato.trim(),
      nome_cliente: form.nome_cliente.trim(),
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      quantidade_ambientes: form.quantidade_ambientes,
      valor_contrato: form.valor_contrato,
      data_fechamento: form.data_fechamento || null,
      projetista: form.projetista.trim() || null,
      status: "medicao",
      comissao_percentual: comissaoResult.percentual,
      comissao_valor: Math.round((form.valor_contrato * comissaoResult.percentual / 100) * 100) / 100,
      comissao_status: "pendente",
    } as any);

    setSaving(false);
    if (error) toast.error("Erro ao adicionar");
    else {
      toast.success("Acompanhamento adicionado!");
      setShowAdd(false);
      setForm({ numero_contrato: "", nome_cliente: "", cpf_cnpj: "", quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "" });
      fetchTrackings();
    }
  };

  const filtered = trackings.filter((t) =>
    t.numero_contrato.toLowerCase().includes(search.toLowerCase()) ||
    t.nome_cliente.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusLabel = (val: string) => STATUS_OPTIONS.find((s) => s.value === val)?.label || val;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Acompanhamento de Projetos</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchTrackings} className="gap-1">
                <RefreshCw className="h-3 w-3" />Atualizar
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
                <Plus className="h-3 w-3" />Novo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por contrato ou cliente..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Status</TableHead>
                  <TableHead>Nº Contrato</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-center">Ambientes</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Fechamento</TableHead>
                  <TableHead>Projetista</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                ) : (
                  filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Select value={t.status} onValueChange={(val) => handleStatusChange(t.id, val)}>
                          <SelectTrigger className="h-8 text-xs">
                            <Badge className={`${STATUS_COLORS[t.status] || ""} text-xs font-medium border-0`}>
                              {getStatusLabel(t.status)}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{t.numero_contrato}</TableCell>
                      <TableCell>{t.nome_cliente}</TableCell>
                      <TableCell className="text-center">{t.quantidade_ambientes}</TableCell>
                      <TableCell className="text-right">
                        {Number(t.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      <TableCell>
                        {t.data_fechamento ? format(new Date(t.data_fechamento), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>{t.projetista || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Acompanhamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº Contrato *</Label>
                <Input value={form.numero_contrato} onChange={(e) => setForm({ ...form, numero_contrato: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Nome do Cliente *</Label>
              <Input value={form.nome_cliente} onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Ambientes</Label>
                <Input type="number" value={form.quantidade_ambientes} onChange={(e) => setForm({ ...form, quantidade_ambientes: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Valor do Contrato</Label>
                <Input type="number" value={form.valor_contrato} onChange={(e) => setForm({ ...form, valor_contrato: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Data Fechamento</Label>
                <Input type="date" value={form.data_fechamento} onChange={(e) => setForm({ ...form, data_fechamento: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Projetista</Label>
              <Input value={form.projetista} onChange={(e) => setForm({ ...form, projetista: e.target.value })} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
