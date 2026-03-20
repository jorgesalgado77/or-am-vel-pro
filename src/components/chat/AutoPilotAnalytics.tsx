import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bot, Zap, MessageSquare, Coins, TrendingUp, Brain } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Interaction {
  id: string;
  client_name: string | null;
  mensagem_cliente: string | null;
  intencao_detectada: string | null;
  resposta_ia: string | null;
  tokens_usados: number;
  modo: string;
  enviada: boolean;
  created_at: string;
}

const INTENT_COLORS: Record<string, string> = {
  orcamento: "hsl(var(--chart-1))",
  fechamento: "hsl(var(--chart-2))",
  preco: "hsl(var(--chart-3))",
  duvida: "hsl(var(--chart-4))",
  objecao: "hsl(var(--chart-5))",
  saudacao: "hsl(var(--muted-foreground))",
  outro: "hsl(var(--muted-foreground))",
};

const INTENT_LABELS: Record<string, string> = {
  orcamento: "💰 Orçamento",
  fechamento: "🎯 Fechamento",
  preco: "💲 Preço",
  duvida: "❓ Dúvida",
  objecao: "⚠️ Objeção",
  saudacao: "👋 Saudação",
  outro: "💬 Outro",
};

interface Props {
  tenantId: string | null;
}

export function AutoPilotAnalytics({ tenantId }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7");

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const since = subDays(new Date(), parseInt(period)).toISOString();

    const { data } = await supabase
      .from("vendazap_interactions" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    setInteractions((data as any[]) || []);
    setLoading(false);
  }, [tenantId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Metrics
  const totalInteractions = interactions.length;
  const totalAutoPilot = interactions.filter((i) => i.modo === "autopilot").length;
  const totalSuggestions = interactions.filter((i) => i.modo === "sugestao").length;
  const totalTokens = interactions.reduce((s, i) => s + (i.tokens_usados || 0), 0);
  const totalSent = interactions.filter((i) => i.enviada).length;

  // Intent distribution for pie chart
  const intentCounts: Record<string, number> = {};
  interactions.forEach((i) => {
    const key = i.intencao_detectada || "outro";
    intentCounts[key] = (intentCounts[key] || 0) + 1;
  });
  const pieData = Object.entries(intentCounts).map(([name, value]) => ({
    name: INTENT_LABELS[name] || name,
    value,
    fill: INTENT_COLORS[name] || INTENT_COLORS.outro,
  }));

  // Daily chart data
  const dailyMap: Record<string, { date: string; respostas: number; tokens: number; autopilot: number }> = {};
  for (let d = parseInt(period); d >= 0; d--) {
    const dateStr = format(subDays(new Date(), d), "dd/MM");
    dailyMap[dateStr] = { date: dateStr, respostas: 0, tokens: 0, autopilot: 0 };
  }
  interactions.forEach((i) => {
    const dateStr = format(new Date(i.created_at), "dd/MM");
    if (dailyMap[dateStr]) {
      dailyMap[dateStr].respostas += 1;
      dailyMap[dateStr].tokens += i.tokens_usados || 0;
      if (i.modo === "autopilot") dailyMap[dateStr].autopilot += 1;
    }
  });
  const dailyData = Object.values(dailyMap);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-muted-foreground animate-pulse">Carregando analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Analytics Auto-Pilot
        </h3>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground">Total Interações</p>
                <p className="text-lg font-bold">{totalInteractions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Auto-Pilot</p>
                <p className="text-lg font-bold">{totalAutoPilot}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Sugestões</p>
                <p className="text-lg font-bold">{totalSuggestions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Tokens</p>
                <p className="text-lg font-bold">{totalTokens.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Enviadas</p>
                <p className="text-lg font-bold">{totalSent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Daily responses */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Respostas por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="respostas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total" />
                <Bar dataKey="autopilot" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Auto-Pilot" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Intent pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Intenções Detectadas</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    innerRadius={35}
                    strokeWidth={2}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
              {pieData.map((d, i) => (
                <span key={i} className="text-[9px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.fill }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent interactions table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Últimas Interações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto max-h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Data</TableHead>
                  <TableHead className="text-[10px]">Cliente</TableHead>
                  <TableHead className="text-[10px]">Intenção</TableHead>
                  <TableHead className="text-[10px]">Modo</TableHead>
                  <TableHead className="text-[10px]">Tokens</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interactions.slice(0, 30).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(item.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell className="text-[10px] font-medium max-w-[100px] truncate">
                      {item.client_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                        {INTENT_LABELS[item.intencao_detectada || "outro"] || item.intencao_detectada}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px]">
                      {item.modo === "autopilot" ? "🤖" : "💡"}
                    </TableCell>
                    <TableCell className="text-[10px] tabular-nums">{item.tokens_usados}</TableCell>
                    <TableCell className="text-[10px]">
                      {item.enviada ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
