import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Gift, Link2, Copy, CheckCircle2, Users, TrendingUp, Award,
  ExternalLink, RefreshCw, Search, Settings, Save, Plus, Trash2,
  Share2, QrCode, UserPlus
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Referral {
  id: string;
  referrer_client_id: string;
  referrer_name: string;
  referrer_phone: string;
  referred_client_id: string | null;
  referred_name: string | null;
  referred_phone: string | null;
  referral_code: string;
  status: "pending" | "converted" | "rewarded";
  reward_type: string | null;
  reward_value: number | null;
  reward_delivered: boolean;
  created_at: string;
  converted_at: string | null;
}

interface ReferralLink {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  referral_code: string;
  total_referrals: number;
  converted_referrals: number;
  created_at: string;
}

interface RewardConfig {
  reward_type: "discount_percent" | "discount_fixed" | "cashback" | "gift";
  reward_value: number;
  reward_description: string;
  min_conversion_value: number;
  active: boolean;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  converted: { label: "Convertido", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  rewarded: { label: "Recompensado", color: "bg-green-500/10 text-green-700 border-green-200" },
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

// Gamification tiers
const GAMIFICATION_TIERS = [
  { name: "Bronze", min: 1, max: 4, color: "bg-amber-700/10 text-amber-800 border-amber-300", icon: "🥉", bgGradient: "from-amber-100 to-amber-50" },
  { name: "Prata", min: 5, max: 14, color: "bg-slate-200/50 text-slate-700 border-slate-300", icon: "🥈", bgGradient: "from-slate-100 to-slate-50" },
  { name: "Ouro", min: 15, max: Infinity, color: "bg-yellow-400/20 text-yellow-700 border-yellow-400", icon: "🥇", bgGradient: "from-yellow-100 to-yellow-50" },
];

function getTier(convertedCount: number) {
  return GAMIFICATION_TIERS.find(t => convertedCount >= t.min && convertedCount <= t.max) || null;
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function ReferralPanel() {
  const tenantId = getTenantId();
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Create link form
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedExistingClient, setSelectedExistingClient] = useState<{ id: string; nome: string; telefone1?: string | null; telefone2?: string | null } | null>(null);
  const [existingClients, setExistingClients] = useState<{ id: string; nome: string; telefone1?: string | null; telefone2?: string | null }[]>([]);

  // Reward config
  const [rewardConfig, setRewardConfig] = useState<RewardConfig>({
    reward_type: "discount_percent",
    reward_value: 5,
    reward_description: "5% de desconto no próximo projeto",
    min_conversion_value: 0,
    active: true,
  });

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);

    // Fetch referral links
    const { data: linksData } = await supabase
      .from("referral_links" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (linksData) setLinks(linksData as unknown as ReferralLink[]);

    // Fetch referrals
    const { data: refsData } = await supabase
      .from("referrals" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (refsData) setReferrals(refsData as unknown as Referral[]);

    // Fetch reward config
    const { data: configData } = await supabase
      .from("referral_config" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (configData) {
      const c = configData as any;
      setRewardConfig({
        reward_type: c.reward_type || "discount_percent",
        reward_value: c.reward_value || 5,
        reward_description: c.reward_description || "5% de desconto",
        min_conversion_value: c.min_conversion_value || 0,
        active: c.active ?? true,
      });
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  // Fetch existing clients for selection
  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("clients")
      .select("id, nome, telefone1, telefone2")
      .eq("tenant_id", tenantId)
      .order("nome")
      .then(({ data }) => {
        if (data) setExistingClients(data as any);
      });
  }, [tenantId]);

  // KPIs
  const totalLinks = links.length;
  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter(r => r.status === "converted" || r.status === "rewarded").length;
  const conversionRate = totalReferrals > 0 ? Math.round((convertedReferrals / totalReferrals) * 100) : 0;
  const rewardedCount = referrals.filter(r => r.status === "rewarded").length;

  // Chart data - referrals by day (last 7 days)
  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = format(d, "dd/MM");
      days[key] = 0;
    }
    referrals.forEach(r => {
      const key = format(new Date(r.created_at), "dd/MM");
      if (days[key] !== undefined) days[key]++;
    });
    return Object.entries(days).map(([name, indicacoes]) => ({ name, indicacoes }));
  }, [referrals]);

  // Pie chart - status distribution
  const statusData = useMemo(() => {
    const counts = { pending: 0, converted: 0, rewarded: 0 };
    referrals.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return [
      { name: "Pendentes", value: counts.pending },
      { name: "Convertidos", value: counts.converted },
      { name: "Recompensados", value: counts.rewarded },
    ].filter(d => d.value > 0);
  }, [referrals]);

  const createReferralLink = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    const code = generateReferralCode();
    const { error } = await supabase.from("referral_links" as any).insert({
      tenant_id: tenantId,
      client_name: newClientName.trim(),
      client_phone: newClientPhone.trim(),
      referral_code: code,
      total_referrals: 0,
      converted_referrals: 0,
    } as any);

    if (error) {
      toast.error("Erro ao criar link de indicação");
      console.error(error);
    } else {
      toast.success("Link de indicação criado!");
      setShowCreateDialog(false);
      setNewClientName("");
      setNewClientPhone("");
      fetchData();
    }
  };

  const saveRewardConfig = async () => {
    const { data: existing } = await supabase
      .from("referral_config" as any)
      .select("id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const payload = { ...rewardConfig, tenant_id: tenantId };

    if (existing) {
      await supabase.from("referral_config" as any).update(payload as any).eq("id", (existing as any).id);
    } else {
      await supabase.from("referral_config" as any).insert(payload as any);
    }
    toast.success("Configuração de recompensa salva!");
    setShowSettingsDialog(false);
  };

  const copyLink = (code: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/loja/${tenantId}?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(null), 2000);
  };

  const markAsRewarded = async (referralId: string) => {
    await supabase.from("referrals" as any).update({ status: "rewarded", reward_delivered: true } as any).eq("id", referralId);
    toast.success("Recompensa marcada como entregue!");
    fetchData();
  };

  const deleteLink = async (linkId: string) => {
    if (!confirm("Excluir este link de indicação?")) return;
    await supabase.from("referral_links" as any).delete().eq("id", linkId);
    toast.success("Link excluído");
    fetchData();
  };

  const filteredLinks = links.filter(l =>
    !search || l.client_name?.toLowerCase().includes(search.toLowerCase()) || l.referral_code?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Gere links de indicação para seus clientes e recompense quem traz novos leads.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(true)} className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Recompensas
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo Link
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalLinks}</p>
              <p className="text-xs text-muted-foreground">Links Ativos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReferrals}</p>
              <p className="text-xs text-muted-foreground">Indicações</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{conversionRate}%</p>
              <p className="text-xs text-muted-foreground">Taxa Conversão</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Award className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rewardedCount}</p>
              <p className="text-xs text-muted-foreground">Recompensas</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="links">
        <TabsList>
          <TabsTrigger value="links">Links de Indicação</TabsTrigger>
          <TabsTrigger value="referrals">Indicações Recebidas</TabsTrigger>
          <TabsTrigger value="analytics">Métricas</TabsTrigger>
        </TabsList>

        {/* Links tab */}
        <TabsContent value="links" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou código..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-center">Indicações</TableHead>
                    <TableHead className="text-center">Convertidas</TableHead>
                    <TableHead className="text-center">Nível</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLinks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        <Gift className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhum link de indicação criado.</p>
                        <p className="text-xs mt-1">Crie links para seus melhores clientes indicarem novos leads.</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredLinks.map(link => (
                    <TableRow key={link.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{link.client_name}</p>
                          <p className="text-xs text-muted-foreground">{link.client_phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{link.referral_code}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">{link.total_referrals}</TableCell>
                      <TableCell className="text-center font-medium text-green-600">{link.converted_referrals}</TableCell>
                      <TableCell>
                        {(() => {
                          const tier = getTier(link.converted_referrals);
                          return tier ? (
                            <Badge variant="outline" className={cn("text-xs gap-1", tier.color)}>
                              {tier.icon} {tier.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(link.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(link.referral_code)}
                            title="Copiar link">
                            {copied === link.referral_code ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            const url = `${window.location.origin}/loja/${tenantId}?ref=${link.referral_code}`;
                            window.open(`https://wa.me/${link.client_phone}?text=${encodeURIComponent(`Olá ${link.client_name}! 😊\n\nVocê ganhou um link exclusivo de indicação! Compartilhe com amigos e familiares e ganhe ${rewardConfig.reward_description} a cada indicação convertida! 🎁\n\n👉 ${url}\n\nObrigado por ser nosso cliente! 🙏`)}`, "_blank");
                          }} title="Enviar via WhatsApp">
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLink(link.id)}
                            title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrals tab */}
        <TabsContent value="referrals" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicador</TableHead>
                    <TableHead>Lead Indicado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="w-28">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma indicação recebida ainda.</p>
                        <p className="text-xs mt-1">Quando um lead entrar pelo link de indicação, aparecerá aqui.</p>
                      </TableCell>
                    </TableRow>
                  ) : referrals.map(ref => {
                    const st = STATUS_MAP[ref.status] || STATUS_MAP.pending;
                    return (
                      <TableRow key={ref.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{ref.referrer_name}</p>
                            <p className="text-xs text-muted-foreground">{ref.referrer_phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{ref.referred_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{ref.referred_phone || "—"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.color}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(ref.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {ref.status === "converted" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => markAsRewarded(ref.id)}>
                              <Gift className="h-3 w-3" /> Recompensar
                            </Button>
                          )}
                          {ref.status === "rewarded" && (
                            <Badge className="bg-green-600 text-white text-[10px]">✓ Entregue</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics tab */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Indicações nos últimos 7 dias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="indicacoes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Indicações" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribuição por Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {statusData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gamification Tiers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award className="h-4 w-4" /> Níveis de Gamificação
              </CardTitle>
              <CardDescription className="text-xs">Indicadores são promovidos automaticamente com base nas conversões</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {GAMIFICATION_TIERS.map(tier => {
                  const count = links.filter(l => getTier(l.converted_referrals)?.name === tier.name).length;
                  return (
                    <div key={tier.name} className={cn("rounded-xl p-4 text-center border bg-gradient-to-b", tier.bgGradient, tier.color.split(" ")[2])}>
                      <span className="text-2xl">{tier.icon}</span>
                      <p className="font-bold mt-1">{tier.name}</p>
                      <p className="text-xs mt-0.5">{tier.min}–{tier.max === Infinity ? "∞" : tier.max} conversões</p>
                      <p className="text-lg font-bold mt-2">{count}</p>
                      <p className="text-[10px] opacity-70">indicadores</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top referrers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Indicadores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {links.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum indicador ainda</p>
                ) : (
                  [...links].sort((a, b) => b.total_referrals - a.total_referrals).slice(0, 5).map((link, i) => (
                    <div key={link.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{link.client_name}</p>
                        <p className="text-xs text-muted-foreground">{link.total_referrals} indicações • {link.converted_referrals} convertidas</p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">{link.referral_code}</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Link Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Novo Link de Indicação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Client selector */}
            <div>
              <Label>Selecionar Cliente Cadastrado</Label>
              <div className="relative mt-1">
                <Input
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setSelectedExistingClient(null); }}
                  placeholder="Buscar cliente por nome..."
                  className="pr-8"
                />
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              {clientSearch && !selectedExistingClient && (
                <div className="border rounded-md mt-1 max-h-32 overflow-y-auto">
                  {existingClients
                    .filter(c => c.nome.toLowerCase().includes(clientSearch.toLowerCase()))
                    .slice(0, 6)
                    .map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors text-sm"
                        onClick={() => {
                          setSelectedExistingClient(c);
                          setNewClientName(c.nome);
                          setNewClientPhone(c.telefone1 || c.telefone2 || "");
                          setClientSearch(c.nome);
                        }}
                      >
                        <span className="font-medium">{c.nome}</span>
                        {c.telefone1 && <span className="text-xs text-muted-foreground ml-2">{c.telefone1}</span>}
                      </button>
                    ))
                  }
                  {existingClients.filter(c => c.nome.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <p className="text-xs text-muted-foreground p-3">Nenhum cliente encontrado</p>
                  )}
                </div>
              )}
              {selectedExistingClient && (
                <Badge variant="secondary" className="mt-1 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {selectedExistingClient.nome}
                </Badge>
              )}
            </div>

            <Separator />

            <div>
              <Label>Nome do Cliente</Label>
              <Input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Ex: Maria Silva" className="mt-1" />
            </div>
            <div>
              <Label>Telefone (WhatsApp)</Label>
              <Input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} placeholder="5511999999999" className="mt-1" />
            </div>
            <p className="text-xs text-muted-foreground">
              Um código único será gerado automaticamente. O link poderá ser enviado via WhatsApp diretamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={createReferralLink} className="gap-1.5"><Plus className="h-4 w-4" /> Criar Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reward Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5" /> Configurar Recompensa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Sistema de Indicação Ativo</Label>
                <p className="text-xs text-muted-foreground">Habilita/desabilita a aceitação de indicações</p>
              </div>
              <Switch checked={rewardConfig.active} onCheckedChange={v => setRewardConfig(p => ({ ...p, active: v }))} />
            </div>

            <Separator />

            <div>
              <Label>Tipo de Recompensa</Label>
              <Select value={rewardConfig.reward_type} onValueChange={v => setRewardConfig(p => ({ ...p, reward_type: v as any }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount_percent">Desconto em % no próximo projeto</SelectItem>
                  <SelectItem value="discount_fixed">Desconto em R$ fixo</SelectItem>
                  <SelectItem value="cashback">Cashback / Crédito</SelectItem>
                  <SelectItem value="gift">Brinde / Presente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor da Recompensa</Label>
              <Input
                type="number"
                value={rewardConfig.reward_value}
                onChange={e => setRewardConfig(p => ({ ...p, reward_value: Number(e.target.value) }))}
                placeholder={rewardConfig.reward_type === "discount_percent" ? "Ex: 5 (%)" : "Ex: 200 (R$)"}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Descrição da Recompensa</Label>
              <Input
                value={rewardConfig.reward_description}
                onChange={e => setRewardConfig(p => ({ ...p, reward_description: e.target.value }))}
                placeholder="Ex: 5% de desconto no próximo projeto"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Essa descrição será mostrada ao cliente indicador</p>
            </div>

            <div>
              <Label>Valor mínimo de conversão (R$)</Label>
              <Input
                type="number"
                value={rewardConfig.min_conversion_value}
                onChange={e => setRewardConfig(p => ({ ...p, min_conversion_value: Number(e.target.value) }))}
                placeholder="0 = sem mínimo"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">O lead indicado precisa converter com pelo menos esse valor para a recompensa valer</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Cancelar</Button>
            <Button onClick={saveRewardConfig} className="gap-1.5"><Save className="h-4 w-4" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
