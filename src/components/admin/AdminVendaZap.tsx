import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Bot, Store, BarChart3, Settings, Sparkles, MessageSquare,
  Save, Edit, Plus, RefreshCw, Zap,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AddonRow {
  id: string;
  tenant_id: string;
  ativo: boolean;
  max_mensagens_dia: number;
  max_tokens_mensagem: number;
  prompt_sistema: string;
  tom_padrao: string;
  created_at: string;
  tenant_nome?: string;
}

interface UsageRow {
  tenant_id: string;
  tenant_nome?: string;
  total_mensagens: number;
  total_tokens: number;
}

export function AdminVendaZap() {
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [usageStats, setUsageStats] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingAddon, setEditingAddon] = useState<AddonRow | null>(null);

  // Form
  const [fTenantId, setFTenantId] = useState("");
  const [fAtivo, setFAtivo] = useState(true);
  const [fMaxMsg, setFMaxMsg] = useState(50);
  const [fMaxTokens, setFMaxTokens] = useState(300);
  const [fPrompt, setFPrompt] = useState("Você é um assistente de vendas especializado em móveis planejados. Gere mensagens curtas, persuasivas e naturais para WhatsApp. Foco em conversão.");
  const [fTom, setFTom] = useState("persuasivo");

  const fetchData = async () => {
    setLoading(true);
    const [addonsRes, tenantsRes, messagesRes] = await Promise.all([
      supabase.from("vendazap_addon").select("*").order("created_at", { ascending: false }),
      supabase.from("tenants").select("id, nome_loja").order("nome_loja"),
      supabase.from("vendazap_messages").select("tenant_id, tokens_usados"),
    ]);

    const tenantsList = (tenantsRes.data || []) as any[];
    setTenants(tenantsList);

    const tenantMap = Object.fromEntries(tenantsList.map((t: any) => [t.id, t.nome_loja]));

    if (addonsRes.data) {
      setAddons((addonsRes.data as any[]).map(a => ({
        ...a,
        tenant_nome: tenantMap[a.tenant_id] || "Desconhecida",
      })));
    }

    // Aggregate usage
    const msgData = (messagesRes.data || []) as any[];
    const usageMap: Record<string, { total_mensagens: number; total_tokens: number }> = {};
    msgData.forEach((m: any) => {
      if (!usageMap[m.tenant_id]) usageMap[m.tenant_id] = { total_mensagens: 0, total_tokens: 0 };
      usageMap[m.tenant_id].total_mensagens++;
      usageMap[m.tenant_id].total_tokens += m.tokens_usados || 0;
    });

    setUsageStats(Object.entries(usageMap).map(([tid, stats]) => ({
      tenant_id: tid,
      tenant_nome: tenantMap[tid] || "Desconhecida",
      ...stats,
    })));

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditingAddon(null);
    setFTenantId("");
    setFAtivo(true);
    setFMaxMsg(50);
    setFMaxTokens(300);
    setFPrompt("Você é um assistente de vendas especializado em móveis planejados. Gere mensagens curtas, persuasivas e naturais para WhatsApp. Foco em conversão.");
    setFTom("persuasivo");
    setShowConfigDialog(true);
  };

  const openEdit = (a: AddonRow) => {
    setEditingAddon(a);
    setFTenantId(a.tenant_id);
    setFAtivo(a.ativo);
    setFMaxMsg(a.max_mensagens_dia);
    setFMaxTokens(a.max_tokens_mensagem);
    setFPrompt(a.prompt_sistema);
    setFTom(a.tom_padrao);
    setShowConfigDialog(true);
  };

  const saveAddon = async () => {
    if (!fTenantId) { toast.error("Selecione uma loja"); return; }
    const payload: any = {
      tenant_id: fTenantId,
      ativo: fAtivo,
      max_mensagens_dia: fMaxMsg,
      max_tokens_mensagem: fMaxTokens,
      prompt_sistema: fPrompt,
      tom_padrao: fTom,
    };

    if (editingAddon) {
      const { error } = await supabase.from("vendazap_addon").update(payload).eq("id", editingAddon.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Configuração atualizada!");
    } else {
      const { error } = await supabase.from("vendazap_addon").insert(payload);
      if (error) {
        if (error.code === "23505") toast.error("Esta loja já possui VendaZap configurado");
        else toast.error("Erro ao criar configuração");
      } else toast.success("VendaZap ativado para a loja!");
    }
    setShowConfigDialog(false);
    fetchData();
  };

  const totalMsgs = usageStats.reduce((s, u) => s + u.total_mensagens, 0);
  const totalTokens = usageStats.reduce((s, u) => s + u.total_tokens, 0);
  const lojasAtivas = addons.filter(a => a.ativo).length;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Lojas com VendaZap", value: addons.length, icon: Store },
          { label: "Lojas Ativas", value: lojasAtivas, icon: Zap },
          { label: "Mensagens Geradas", value: totalMsgs, icon: MessageSquare },
          { label: "Tokens Consumidos", value: totalTokens.toLocaleString("pt-BR"), icon: Sparkles },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <kpi.icon className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="lojas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lojas" className="gap-2"><Store className="h-4 w-4" />Lojas</TabsTrigger>
          <TabsTrigger value="uso" className="gap-2"><BarChart3 className="h-4 w-4" />Uso</TabsTrigger>
          <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" />Config Global</TabsTrigger>
        </TabsList>

        <TabsContent value="lojas" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Lojas com VendaZap AI</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                <RefreshCw className="h-3 w-3" />Atualizar
              </Button>
              <Button size="sm" onClick={openNew} className="gap-2">
                <Plus className="h-3 w-3" />Ativar para Loja
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Limite/Dia</TableHead>
                    <TableHead>Tom Padrão</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                  ) : addons.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma loja com VendaZap</TableCell></TableRow>
                  ) : addons.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-foreground">{a.tenant_nome}</TableCell>
                      <TableCell>
                        <Badge variant={a.ativo ? "default" : "secondary"}>{a.ativo ? "Ativo" : "Inativo"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.max_mensagens_dia > 0 ? a.max_mensagens_dia : "∞"}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{a.tom_padrao}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(a.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="uso" className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Consumo por Loja</h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Mensagens Geradas</TableHead>
                    <TableHead>Tokens Consumidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageStats.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sem dados de uso</TableCell></TableRow>
                  ) : usageStats.sort((a, b) => b.total_mensagens - a.total_mensagens).map(u => (
                    <TableRow key={u.tenant_id}>
                      <TableCell className="font-medium text-foreground">{u.tenant_nome}</TableCell>
                      <TableCell className="text-muted-foreground">{u.total_mensagens}</TableCell>
                      <TableCell className="text-muted-foreground">{u.total_tokens.toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações Globais do VendaZap AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                As configurações de prompt e limites são definidas individualmente para cada loja.
                Use a aba "Lojas" para editar cada configuração.
              </p>
              <p className="text-sm text-muted-foreground">
                O VendaZap utiliza inteligência artificial integrada à plataforma (Lovable AI).
                Não é necessário configurar chaves de API externas.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Config Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {editingAddon ? "Editar VendaZap" : "Ativar VendaZap para Loja"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Loja</Label>
              <Select value={fTenantId} onValueChange={setFTenantId} disabled={!!editingAddon}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione uma loja" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome_loja}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={fAtivo} onCheckedChange={setFAtivo} />
              <Label>Add-on ativo</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Limite mensagens/dia</Label>
                <Input type="number" value={fMaxMsg} onChange={(e) => setFMaxMsg(Number(e.target.value))} className="mt-1" />
                <p className="text-[10px] text-muted-foreground mt-0.5">0 = ilimitado</p>
              </div>
              <div>
                <Label>Tom padrão</Label>
                <Select value={fTom} onValueChange={setFTom}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direto">Direto</SelectItem>
                    <SelectItem value="consultivo">Consultivo</SelectItem>
                    <SelectItem value="persuasivo">Persuasivo</SelectItem>
                    <SelectItem value="amigavel">Amigável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Prompt do Sistema</Label>
              <Textarea
                value={fPrompt}
                onChange={(e) => setFPrompt(e.target.value)}
                rows={4}
                className="mt-1 text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Instrução base enviada para a IA em cada requisição</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>Cancelar</Button>
            <Button onClick={saveAddon} className="gap-2"><Save className="h-4 w-4" />Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
