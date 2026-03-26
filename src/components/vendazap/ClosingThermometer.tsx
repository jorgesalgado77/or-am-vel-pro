/**
 * Visual thermometer showing how close a message/interaction is to closing a sale.
 */
import { Flame, ThermometerSun, Snowflake, TrendingUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  if (!message || message.trim().length < 2) return { score: 0, intent: "vazio" };

  const lower = message.toLowerCase();

  // Very positive signals → high score
  if (/fechar|quero comprar|vou levar|aceito|pode fazer|fechado|manda o contrato|vamos nessa/i.test(lower)) {
    return { score: 90, intent: "fechamento" };
  }
  // Client wants price by message/WhatsApp/email → redirect to meeting/Deal Room
  if (/manda.*pre[çc]o|envia.*pre[çc]o|envia.*valor|manda.*valor|envia.*or[çc]amento|manda.*or[çc]amento|por whats|pelo whats|por e-?mail|pelo e-?mail|por mensagem|pela mensagem|me envia|pode mandar|pode enviar|passa.*pre[çc]o|passa.*valor|manda.*por aqui|envia.*por aqui/i.test(lower)) {
    return { score: 50, intent: "enviar_preco" };
  }
  if (/or[çc]amento|quanto custa|valor|pre[çc]o|proposta|me passa/i.test(lower)) {
    return { score: 65, intent: "orçamento" };
  }
  if (/desconto|condi[çc][ãa]o|parcel|pagamento|negocia|mais barato/i.test(lower)) {
    return { score: 55, intent: "negociação" };
  }
  if (/como funciona|d[úu]vida|explica|garantia|prazo|entrega/i.test(lower)) {
    return { score: 45, intent: "dúvida" };
  }
  // Objections — still interest, just needs breaking
  if (/caro|vou pensar|depois|outro lugar|concorr|n[ãa]o sei|preciso ver/i.test(lower)) {
    return { score: 30, intent: "objeção" };
  }
  // Negative signals
  if (/n[ãa]o quero|desist|cancel|n[ãa]o tenho interesse|obrigad[oa] mas/i.test(lower)) {
    return { score: 15, intent: "resistência" };
  }
  // Greeting
  if (/bom dia|boa tarde|boa noite|oi|ol[áa]|tudo bem/i.test(lower)) {
    return { score: 25, intent: "saudação" };
  }

  return { score: 35, intent: "neutro" };
}
