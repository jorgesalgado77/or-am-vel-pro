import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Users, DollarSign, TrendingUp, Eye, Search, CheckCircle2, XCircle,
  RefreshCw, Settings, Save, Ban, UserCheck, Gift, BarChart3
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

interface Affiliate {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  cpf: string;
  pix_key: string;
  affiliate_code: string;
  status: string;
  created_at: string;
}

interface Conversion {
  id: string;
  affiliate_id: string;
  affiliate_name?: string;
  affiliate_code?: string;
  user_id: string | null;
  plan: string;
  amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

const AFFILIATE_STATUS: Record<string, { label: string; class: string }> = {
  active: { label: "Ativo", class: "bg-green-100 text-green-800" },
  blocked: { label: "Bloqueado", class: "bg-red-100 text-red-800" },
  pending: { label: "Pendente", class: "bg-amber-100 text-amber-800" },
};

const CONVERSION_STATUS: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-amber-100 text-amber-800" },
  approved: { label: "Aprovada", class: "bg-blue-100 text-blue-800" },
  paid: { label: "Paga", class: "bg-green-100 text-green-800" },
  rejected: { label: "Rejeitada", class: "bg-red-100 text-red-800" },
};

export function AdminAffiliates() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedConversion, setSelectedConversion] = useState<Conversion | null>(null);
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [showAddConversion, setShowAddConversion] = useState(false);

  // Add conversion form
  const [newConvAffiliateId, setNewConvAffiliateId] = useState("");
  const [newConvPlan, setNewConvPlan] = useState("");
  const [newConvAmount, setNewConvAmount] = useState("");

  // Settings
  const [commissionPercent, setCommissionPercent] = useState(5);
  const [cookieDays, setCookieDays] = useState(30);
  const [programActive, setProgramActive] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [affRes, convRes, settingsRes] = await Promise.all([
      supabase.from("affiliates" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("affiliate_conversions" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("affiliate_settings" as any).select("*").limit(1),
    ]);

    if (affRes.data) setAffiliates(affRes.data as any);
    
    // Enrich conversions with affiliate info
    if (convRes.data && affRes.data) {
      const affMap = new Map((affRes.data as any[]).map(a => [a.id, a]));
      const enriched = (convRes.data as any[]).map(c => ({
        ...c,
        affiliate_name: affMap.get(c.affiliate_id)?.name || "—",
        affiliate_code: affMap.get(c.affiliate_id)?.affiliate_code || "—",
      }));
      setConversions(enriched);
    }

    if (settingsRes.data && (settingsRes.data as any[]).length > 0) {
      const s = (settingsRes.data as any[])[0];
      setCommissionPercent(s.commission_percent || 5);
      setCookieDays(s.cookie_days || 30);
      setProgramActive(s.active ?? true);
    }

    setLoading(false);
  }

  async function toggleAffiliateStatus(aff: Affiliate) {
    const newStatus = aff.status === "active" ? "blocked" : "active";
    const { error } = await supabase
      .from("affiliates" as any)
      .update({ status: newStatus } as any)
      .eq("id", aff.id);

    if (error) { toast.error("Erro ao atualizar status."); return; }
    toast.success(`Afiliado ${newStatus === "active" ? "ativado" : "bloqueado"}.`);
    loadData();
  }

  async function updateConversionStatus(convId: string, newStatus: string) {
    const { error } = await supabase
      .from("affiliate_conversions" as any)
      .update({ status: newStatus } as any)
      .eq("id", convId);

    if (error) { toast.error("Erro ao atualizar conversão."); return; }
    toast.success(`Conversão ${CONVERSION_STATUS[newStatus]?.label || newStatus}.`);
    setShowConversionDialog(false);
    loadData();
  }

  async function addConversion() {
    if (!newConvAffiliateId || !newConvPlan || !newConvAmount) {
      toast.error("Preencha todos os campos.");
      return;
    }
    const amount = parseFloat(newConvAmount);
    const commission = amount * (commissionPercent / 100);

    const { error } = await supabase
      .from("affiliate_conversions" as any)
      .insert({
        affiliate_id: newConvAffiliateId,
        plan: newConvPlan,
        amount: Math.round(amount * 100) / 100,
        commission_amount: Math.round(commission * 100) / 100,
        status: "pending",
      } as any);

    if (error) { toast.error("Erro ao registrar conversão."); return; }
    toast.success("Conversão registrada com sucesso!");
    setShowAddConversion(false);
    setNewConvAffiliateId("");
    setNewConvPlan("");
    setNewConvAmount("");
    loadData();
  }

  async function saveSettings() {
    const { data: existing } = await supabase.from("affiliate_settings" as any).select("id").limit(1);
    
    const payload = {
      commission_percent: commissionPercent,
      cookie_days: cookieDays,
      active: programActive,
    };

    if (existing && (existing as any[]).length > 0) {
      await supabase.from("affiliate_settings" as any).update(payload as any).eq("id", (existing as any[])[0].id);
    } else {
      await supabase.from("affiliate_settings" as any).insert(payload as any);
    }
    toast.success("Configurações salvas!");
  }

  const filtered = affiliates.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    a.affiliate_code.toLowerCase().includes(search.toLowerCase())
  );

  const totalAffiliates = affiliates.length;
  const activeAffiliates = affiliates.filter(a => a.status === "active").length;
  const totalRevenue = conversions.filter(c => c.status !== "rejected").reduce((s, c) => s + (c.amount || 0), 0);
  const totalCommission = conversions.filter(c => c.status === "approved" || c.status === "paid").reduce((s, c) => s + (c.commission_amount || 0), 0);
  const pendingCommission = conversions.filter(c => c.status === "pending").reduce((s, c) => s + (c.commission_amount || 0), 0);

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Afiliados", value: totalAffiliates, sub: `${activeAffiliates} ativos`, icon: Users, color: "text-blue-600" },
          { label: "Conversões", value: conversions.length, sub: `${conversions.filter(c => c.status === "pending").length} pendentes`, icon: TrendingUp, color: "text-purple-600" },
          { label: "Receita Gerada", value: `R$ ${totalRevenue.toFixed(2)}`, sub: "via afiliados", icon: DollarSign, color: "text-emerald-600" },
          { label: "Comissão Aprovada", value: `R$ ${totalCommission.toFixed(2)}`, sub: "a pagar", icon: CheckCircle2, color: "text-green-600" },
          { label: "Comissão Pendente", value: `R$ ${pendingCommission.toFixed(2)}`, sub: "aguardando", icon: Eye, color: "text-amber-600" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <k.icon className={`w-5 h-5 ${k.color} mb-1`} />
              <p className="text-xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-[10px] text-muted-foreground/70">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="affiliates">
        <TabsList>
          <TabsTrigger value="affiliates"><Users className="w-4 h-4 mr-1" /> Afiliados</TabsTrigger>
          <TabsTrigger value="conversions"><DollarSign className="w-4 h-4 mr-1" /> Conversões</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-1" /> Configurações</TabsTrigger>
        </TabsList>

        {/* Affiliates Tab */}
        <TabsContent value="affiliates" className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, email ou código..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{a.affiliate_code}</code></TableCell>
                      <TableCell className="text-sm">{a.whatsapp}</TableCell>
                      <TableCell>
                        <Badge className={AFFILIATE_STATUS[a.status]?.class}>{AFFILIATE_STATUS[a.status]?.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(a.created_at), "dd/MM/yy")}</TableCell>
                      <TableCell>
                        <Button size="sm" variant={a.status === "active" ? "destructive" : "default"} onClick={() => toggleAffiliateStatus(a)}>
                          {a.status === "active" ? <Ban className="w-3 h-3 mr-1" /> : <UserCheck className="w-3 h-3 mr-1" />}
                          {a.status === "active" ? "Bloquear" : "Ativar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum afiliado encontrado.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversions Tab */}
        <TabsContent value="conversions" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAddConversion(true)} size="sm">
              <Gift className="w-4 h-4 mr-1" /> Registrar Conversão Manual
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Afiliado</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{format(new Date(c.created_at), "dd/MM/yy")}</TableCell>
                      <TableCell className="font-medium">{c.affiliate_name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.affiliate_code}</code></TableCell>
                      <TableCell>{c.plan}</TableCell>
                      <TableCell>R$ {(c.amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-semibold text-emerald-600">R$ {(c.commission_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={CONVERSION_STATUS[c.status]?.class}>{CONVERSION_STATUS[c.status]?.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedConversion(c); setShowConversionDialog(true); }}>
                          Gerenciar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {conversions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma conversão registrada.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configurações do Programa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Programa Ativo</Label>
                  <p className="text-sm text-muted-foreground">Ativar/desativar o programa de afiliados</p>
                </div>
                <Switch checked={programActive} onCheckedChange={setProgramActive} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Comissão (%)</Label>
                  <Input type="number" min={0} max={100} value={commissionPercent} onChange={e => setCommissionPercent(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Tempo do Cookie (dias)</Label>
                  <Input type="number" min={1} max={365} value={cookieDays} onChange={e => setCookieDays(Number(e.target.value))} />
                </div>
              </div>

              <Button onClick={saveSettings}><Save className="w-4 h-4 mr-2" /> Salvar Configurações</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manage Conversion Dialog */}
      <Dialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Conversão</DialogTitle>
          </DialogHeader>
          {selectedConversion && (
            <div className="space-y-3">
              <p><strong>Afiliado:</strong> {selectedConversion.affiliate_name}</p>
              <p><strong>Plano:</strong> {selectedConversion.plan}</p>
              <p><strong>Valor:</strong> R$ {(selectedConversion.amount || 0).toFixed(2)}</p>
              <p><strong>Comissão:</strong> R$ {(selectedConversion.commission_amount || 0).toFixed(2)}</p>
              <p><strong>Status:</strong> <Badge className={CONVERSION_STATUS[selectedConversion.status]?.class}>{CONVERSION_STATUS[selectedConversion.status]?.label}</Badge></p>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            {selectedConversion?.status === "pending" && (
              <>
                <Button onClick={() => updateConversionStatus(selectedConversion.id, "approved")} className="bg-blue-600 hover:bg-blue-700">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                </Button>
                <Button onClick={() => updateConversionStatus(selectedConversion.id, "rejected")} variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                </Button>
              </>
            )}
            {selectedConversion?.status === "approved" && (
              <Button onClick={() => updateConversionStatus(selectedConversion.id, "paid")} className="bg-green-600 hover:bg-green-700">
                <DollarSign className="w-4 h-4 mr-1" /> Marcar como Pago
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Conversion Dialog */}
      <Dialog open={showAddConversion} onOpenChange={setShowAddConversion}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Conversão Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Afiliado</Label>
              <Select value={newConvAffiliateId} onValueChange={setNewConvAffiliateId}>
                <SelectTrigger><SelectValue placeholder="Selecione o afiliado" /></SelectTrigger>
                <SelectContent>
                  {affiliates.filter(a => a.status === "active").map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.affiliate_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={newConvPlan} onValueChange={setNewConvPlan}>
                <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter_mensal">Starter Mensal</SelectItem>
                  <SelectItem value="starter_anual">Starter Anual</SelectItem>
                  <SelectItem value="professional_mensal">Professional Mensal</SelectItem>
                  <SelectItem value="professional_anual">Professional Anual</SelectItem>
                  <SelectItem value="enterprise_mensal">Enterprise Mensal</SelectItem>
                  <SelectItem value="enterprise_anual">Enterprise Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor da Assinatura (R$)</Label>
              <Input type="number" value={newConvAmount} onChange={e => setNewConvAmount(e.target.value)} placeholder="0.00" />
              {newConvAmount && (
                <p className="text-sm text-emerald-600 mt-1">Comissão: R$ {(parseFloat(newConvAmount || "0") * commissionPercent / 100).toFixed(2)} ({commissionPercent}%)</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddConversion(false)}>Cancelar</Button>
            <Button onClick={addConversion}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
