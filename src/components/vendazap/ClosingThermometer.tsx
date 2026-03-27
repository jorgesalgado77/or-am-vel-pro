/**
 * Visual thermometer showing how close a message/interaction is to closing a sale.
 */
import { Flame, ThermometerSun, Snowflake, TrendingUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { analyzeVendaZapMessage } from "@/lib/vendazapAnalysis";

interface ClosingThermometerProps {
  /** Score 0-100 representing closing proximity */
  score: number;
  /** Label context */
  label?: string;
  /** Compact mode */
  compact?: boolean;
}

interface ThermometerLevel {
  min: number;
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  barColor: string;
  icon: typeof Flame;
  description: string;
}

const LEVELS: ThermometerLevel[] = [
  { min: 80, label: "Pronto p/ fechar", emoji: "🔥", color: "text-red-600", bgColor: "bg-red-500/10", barColor: "bg-gradient-to-r from-orange-500 to-red-500", icon: Trophy, description: "Cliente muito próximo do fechamento!" },
  { min: 60, label: "Aquecido", emoji: "🟠", color: "text-orange-600", bgColor: "bg-orange-500/10", barColor: "bg-gradient-to-r from-amber-400 to-orange-500", icon: Flame, description: "Interesse alto, empurre para o fechamento" },
  { min: 40, label: "Morno", emoji: "🟡", color: "text-amber-600", bgColor: "bg-amber-500/10", barColor: "bg-gradient-to-r from-yellow-400 to-amber-500", icon: ThermometerSun, description: "Precisa de estímulo para avançar" },
  { min: 20, label: "Frio", emoji: "🔵", color: "text-blue-600", bgColor: "bg-blue-500/10", barColor: "bg-gradient-to-r from-blue-300 to-blue-500", icon: Snowflake, description: "Necessita aquecimento e argumentação" },
  { min: 0, label: "Muito frio", emoji: "❄️", color: "text-blue-400", bgColor: "bg-blue-400/10", barColor: "bg-blue-300", icon: Snowflake, description: "Requer abordagem forte para converter" },
];

function getLevel(score: number): ThermometerLevel {
  return LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1];
}

export function ClosingThermometer({ score, label, compact = false }: ClosingThermometerProps) {
  const level = getLevel(score);
  const Icon = level.icon;
  const clampedScore = Math.max(0, Math.min(100, score));

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{level.emoji}</span>
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${level.barColor}`} style={{ width: `${clampedScore}%` }} />
        </div>
        <span className={`text-[10px] font-semibold ${level.color}`}>{clampedScore}%</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${level.bgColor}`}>
      {label && <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${level.color}`} />
          <span className={`text-sm font-bold ${level.color}`}>{level.emoji} {level.label}</span>
        </div>
        <Badge variant="outline" className={`text-xs font-bold ${level.color} border-current`}>
          {clampedScore}%
        </Badge>
      </div>
      <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${level.barColor}`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <TrendingUp className={`h-3 w-3 ${level.color}`} />
        <p className={`text-[10px] ${level.color}`}>{level.description}</p>
      </div>
    </div>
  );
}

/**
 * Analyzes a client message text and returns a closing score estimate (client-side heuristic).
 */
export function analyzeClientMessage(message: string): { score: number; intent: string } {
  return analyzeVendaZapMessage(message);
}
