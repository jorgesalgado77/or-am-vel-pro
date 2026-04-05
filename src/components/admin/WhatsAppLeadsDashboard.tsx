/**
 * WhatsAppLeadsDashboard — metrics and list of leads captured via WhatsApp funnel
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, TrendingUp, MessageCircle, UserCheck, RefreshCw, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface Lead {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  origem: string;
  mensagem: string | null;
  created_at: string;
}

interface TrackingLead {
  id: string;
  nome_cliente: string;
  telefone_principal: string | null;
  status: string;
  origem: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_atendimento: "Em Atendimento",
  qualificado: "Qualificado",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "hsl(220, 70%, 50%)",
  em_atendimento: "hsl(30, 80%, 50%)",
  qualificado: "hsl(260, 60%, 55%)",
  proposta: "hsl(200, 70%, 45%)",
  fechado: "hsl(142, 70%, 40%)",
  perdido: "hsl(0, 60%, 50%)",
};

const PIE_COLORS = ["hsl(220,70%,50%)", "hsl(30,80%,50%)", "hsl(260,60%,55%)", "hsl(200,70%,45%)", "hsl(142,70%,40%)", "hsl(0,60%,50%)"];

export function WhatsAppLeadsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [trackingLeads, setTrackingLeads] = useState<TrackingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const since = startOfDay(subDays(new Date(), parseInt(period))).toISOString();

    const [leadsRes, trackingRes] = await Promise.all([
      supabase
        .from("leads" as any)
        .select("id, nome, email, telefone, origem, mensagem, created_at")
        .eq("origem" as any, "whatsapp_funnel" as any)
        .gte("created_at" as any, since as any)
        .order("created_at" as any, { ascending: false } as any),
      supabase
        .from("client_tracking" as any)
        .select("id, nome_cliente, telefone_principal, status, origem, created_at")
        .eq("origem" as any, "whatsapp_funnel" as any)
        .gte("created_at" as any, since as any)
        .order("created_at" as any, { ascending: false } as any),
    ]);

    setLeads((leadsRes.data as any as Lead[]) || []);
    setTrackingLeads((trackingRes.data as any as TrackingLead[]) || []);
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Metrics
  const totalLeads = leads.length;
  const totalTracking = trackingLeads.length;
  const converted = trackingLeads.filter((t) => t.status === "fechado").length;
  const conversionRate = totalTracking > 0 ? ((converted / totalTracking) * 100).toFixed(1) : "0";
  const inProgress = trackingLeads.filter((t) => !["fechado", "perdido", "novo"].includes(t.status)).length;

  // Daily chart data
  const dailyMap = new Map<string, number>();
  leads.forEach((l) => {
    const day = format(new Date(l.created_at), "dd/MM");
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  });
  const dailyData = Array.from(dailyMap.entries())
    .map(([day, count]) => ({ day, leads: count }))
    .reverse()
    .slice(-14);

  // Status distribution pie
  const statusMap = new Map<string, number>();
  trackingLeads.forEach((t) => {
    statusMap.set(t.status, (statusMap.get(t.status) || 0) + 1);
  });
  const pieData = Array.from(statusMap.entries()).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status,
    value: count,
    color: STATUS_COLORS[status] || "hsl(var(--muted))",
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Dashboard de Leads — Funil WhatsApp
        </h3>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{totalLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
                <p className="text-2xl font-bold">{inProgress}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Convertidos</p>
                <p className="text-2xl font-bold">{converted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxa Conversão</p>
                <p className="text-2xl font-bold">{conversionRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily leads bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="leads" fill="hsl(142, 70%, 40%)" radius={[4, 4, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Sem dados no período</p>
            )}
          </CardContent>
        </Card>

        {/* Status pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Sem dados no período</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leads table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads Capturados ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[350px]">
            {leads.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l) => {
                    const tracking = trackingLeads.find(
                      (t) => t.nome_cliente === l.nome || t.telefone_principal === l.telefone
                    );
                    const status = tracking?.status || "novo";

                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.nome}</TableCell>
                        <TableCell>{l.telefone || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{l.email || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={status === "fechado" ? "default" : status === "perdido" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {STATUS_LABELS[status] || status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(l.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum lead capturado pelo funil WhatsApp neste período.
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
