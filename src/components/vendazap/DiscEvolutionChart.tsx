/**
 * DISC Evolution Chart — shows how D/I/S/C scores change over the conversation.
 */
import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { DiscInsight } from "@/lib/vendazapAnalysis";

interface HistoricoEntry {
  remetente_tipo: "cliente" | "ia";
  mensagem: string;
}

interface Props {
  entries: HistoricoEntry[];
  detectDisc: (msgs: Array<{ remetente_tipo: string; mensagem: string }>) => DiscInsight;
}

const DISC_COLORS = {
  D: "hsl(0, 72%, 51%)",    // red
  I: "hsl(45, 93%, 47%)",   // amber
  S: "hsl(142, 71%, 45%)",  // green
  C: "hsl(217, 91%, 60%)",  // blue
};

export function DiscEvolutionChart({ entries, detectDisc }: Props) {
  const chartData = useMemo(() => {
    const clientEntries = entries.filter(e => e.remetente_tipo === "cliente");
    if (clientEntries.length < 2) return [];

    const points: Array<{ msg: number; D: number; I: number; S: number; C: number }> = [];

    // Sample every 2 client messages (or every message if few)
    const step = clientEntries.length <= 10 ? 1 : 2;

    for (let i = step; i <= clientEntries.length; i += step) {
      const slice = entries.filter(e => {
        const clientIdx = entries.filter(x => x.remetente_tipo === "cliente").indexOf(e);
        return clientIdx < i || e.remetente_tipo !== "cliente";
      }).slice(0, entries.indexOf(clientEntries[i - 1]) + 1);

      const mapped = slice.map(e => ({
        remetente_tipo: e.remetente_tipo === "ia" ? "loja" : e.remetente_tipo,
        mensagem: e.mensagem,
      }));

      const insight = detectDisc(mapped);
      points.push({
        msg: i,
        D: insight.scores.D,
        I: insight.scores.I,
        S: insight.scores.S,
        C: insight.scores.C,
      });
    }

    // Always include final state
    const lastPoint = points[points.length - 1];
    if (!lastPoint || lastPoint.msg !== clientEntries.length) {
      const allMapped = entries.map(e => ({
        remetente_tipo: e.remetente_tipo === "ia" ? "loja" : e.remetente_tipo,
        mensagem: e.mensagem,
      }));
      const finalInsight = detectDisc(allMapped);
      points.push({
        msg: clientEntries.length,
        D: finalInsight.scores.D,
        I: finalInsight.scores.I,
        S: finalInsight.scores.S,
        C: finalInsight.scores.C,
      });
    }

    return points;
  }, [entries, detectDisc]);

  if (chartData.length < 2) {
    return (
      <p className="text-[10px] text-muted-foreground text-center py-3">
        Mínimo 2 mensagens do cliente para exibir evolução DISC.
      </p>
    );
  }

  return (
    <div className="w-full h-[140px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
          <XAxis
            dataKey="msg"
            tick={{ fontSize: 9 }}
            tickFormatter={(v) => `${v}`}
            label={{ value: "msgs", position: "insideBottomRight", fontSize: 8, offset: -2 }}
          />
          <YAxis tick={{ fontSize: 9 }} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, padding: "6px 10px" }}
            labelFormatter={(v) => `Após ${v} msgs`}
          />
          <Area type="monotone" dataKey="D" name="🔴 Dominante" stroke={DISC_COLORS.D} fill={DISC_COLORS.D} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} />
          <Area type="monotone" dataKey="I" name="🟡 Influente" stroke={DISC_COLORS.I} fill={DISC_COLORS.I} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} />
          <Area type="monotone" dataKey="S" name="🟢 Estável" stroke={DISC_COLORS.S} fill={DISC_COLORS.S} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} />
          <Area type="monotone" dataKey="C" name="🔵 Conforme" stroke={DISC_COLORS.C} fill={DISC_COLORS.C} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
