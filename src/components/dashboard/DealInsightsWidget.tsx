import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, AlertTriangle, Target, Zap, Flame } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { getCommercialEngine } from "@/services/commercial";
import type { DealAnalysis, DealContext } from "@/services/commercial/types";

interface LeadInsight {
  id: string;
  name: string;
  status: string;
  temperature: string;
  valor: number;
  analysis: DealAnalysis;
}

const RISK_COLORS = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

const AGGR_ICONS = {
  conservadora: Target,
  comercial: TrendingUp,
  agressiva: Zap,
};

export function DealInsightsWidget() {
  const [leads, setLeads] = useState<LeadInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const tenantId = await getResolvedTenantId();
        if (!tenantId) { setLoading(false); return; }

        // Fetch active leads with recent activity
        const { data } = await supabase
          .from("client_tracking")
          .select("id, nome_cliente, status, lead_temperature, valor_orcamento, updated_at")
          .eq("tenant_id", tenantId)
          .not("status", "eq", "fechado")
          .not("status", "eq", "perdido")
          .order("updated_at", { ascending: false })
          .limit(20);

        if (!data || data.length === 0) { setLoading(false); return; }

        const engine = getCommercialEngine();
        const results: LeadInsight[] = [];

        for (const lead of data as any[]) {
          const daysInactive = lead.updated_at
            ? Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000)
            : 0;

          const ctx: DealContext = {
            tenant_id: tenantId,
            customer: {
              id: lead.id,
              name: lead.nome_cliente || "—",
              status: lead.status || "novo",
              temperature: lead.lead_temperature || undefined,
              days_inactive: daysInactive,
              has_simulation: !!lead.valor_orcamento,
            },
            pricing: { total_price: Number(lead.valor_orcamento) || 0 },
            payment: { forma_pagamento: "Boleto", parcelas: 1, valor_entrada: 0, plus_percentual: 0 },
            discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
          };

          const analysis = await engine.analyzeDeal(ctx);
          results.push({
            id: lead.id,
            name: lead.nome_cliente || "—",
            status: lead.status || "novo",
            temperature: lead.lead_temperature || "",
            valor: Number(lead.valor_orcamento) || 0,
            analysis,
          });
        }

        // Sort by closing probability desc, take top 5
        results.sort((a, b) => b.analysis.closing_probability - a.analysis.closing_probability);
        setLeads(results.slice(0, 5));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Inteligência Comercial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (leads.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Top 5 Leads — IA Comercial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {leads.map((lead) => {
          const AggrIcon = AGGR_ICONS[lead.analysis.recommended_aggressiveness];
          return (
            <div
              key={lead.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 shrink-0">
                <Flame className="h-4 w-4 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {lead.name}
                  </span>
                  {lead.temperature === "quente" && <span title="Quente">🔥</span>}
                  {lead.temperature === "morno" && <span title="Morno">🌤️</span>}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-1">
                  {lead.analysis.insights[0] || "Sem insights adicionais"}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${RISK_COLORS[lead.analysis.risk_level]}`}
                >
                  {lead.analysis.closing_probability}%
                </Badge>
                <AggrIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {lead.analysis.margin_alert && (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
