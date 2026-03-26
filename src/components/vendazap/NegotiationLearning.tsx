/**
 * Negotiation Learning Engine — accumulates patterns from conversations
 * and provides insights to improve AI responses over time.
 */
import { TrendingUp, TrendingDown, Brain, BarChart3, Zap, Target, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ---- Learning Data Types ----

export interface NegotiationPattern {
  intent: string;
  mensagem: string;
  frequencia: number;
  melhorResposta: string | null;
  scoreMedio: number;
}

export interface NegotiationSession {
  clientId: string | null;
  clientName: string;
  date: string;
  totalMessages: number;
  avgScore: number;
  finalScore: number;
  objections: string[];
  outcome: "em_andamento" | "concluida";
}

export interface LearningData {
  patterns: NegotiationPattern[];
  sessions: NegotiationSession[];
  totalNegotiations: number;
  avgClosingScore: number;
  topObjections: string[];
  version: number;
}

const STORAGE_KEY = "vendazap-ai-learning";
const CURRENT_VERSION = 1;

// ---- Storage ----

export function loadLearningData(): LearningData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as LearningData;
      if (data.version === CURRENT_VERSION) return data;
    }
  } catch { /* ignore */ }
  return {
    patterns: [],
    sessions: [],
    totalNegotiations: 0,
    avgClosingScore: 0,
    topObjections: [],
    version: CURRENT_VERSION,
  };
}

function saveLearningData(data: LearningData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

// ---- Learning Functions ----

/** Record a client message pattern */
export function learnFromMessage(intent: string, mensagem: string, score: number) {
  const data = loadLearningData();
  const normalized = mensagem.toLowerCase().trim().substring(0, 100);

  // Find or create pattern
  const existing = data.patterns.find(p => p.intent === intent && similarity(p.mensagem, normalized) > 0.6);
  if (existing) {
    existing.frequencia += 1;
    existing.scoreMedio = Math.round((existing.scoreMedio * (existing.frequencia - 1) + score) / existing.frequencia);
  } else {
    data.patterns.push({
      intent,
      mensagem: normalized,
      frequencia: 1,
      melhorResposta: null,
      scoreMedio: score,
    });
  }

  // Keep top 50 patterns by frequency
  data.patterns.sort((a, b) => b.frequencia - a.frequencia);
  data.patterns = data.patterns.slice(0, 50);

  // Update top objections
  data.topObjections = data.patterns
    .filter(p => p.intent === "objeção" || p.intent === "resistência" || p.intent === "negociação")
    .sort((a, b) => b.frequencia - a.frequencia)
    .slice(0, 10)
    .map(p => p.mensagem);

  saveLearningData(data);
}

/** Record an AI response that worked well (user copied/used it) */
export function learnGoodResponse(intent: string, mensagemCliente: string, resposta: string) {
  const data = loadLearningData();
  const normalized = mensagemCliente.toLowerCase().trim().substring(0, 100);

  const pattern = data.patterns.find(p => p.intent === intent && similarity(p.mensagem, normalized) > 0.6);
  if (pattern) {
    pattern.melhorResposta = resposta.substring(0, 500);
  }
  saveLearningData(data);
}

/** Record a completed negotiation session */
export function recordSession(session: NegotiationSession) {
  const data = loadLearningData();
  data.sessions.push(session);
  // Keep last 100 sessions
  data.sessions = data.sessions.slice(-100);
  data.totalNegotiations = data.sessions.length;
  data.avgClosingScore = Math.round(
    data.sessions.reduce((sum, s) => sum + s.avgScore, 0) / data.sessions.length
  );
  saveLearningData(data);
}

/** Build learning context for the AI prompt */
export function buildLearningContext(): string {
  const data = loadLearningData();
  if (data.patterns.length === 0 && data.sessions.length === 0) return "";

  let context = "\n\n--- APRENDIZADO ACUMULADO (use para melhorar suas respostas) ---";

  // Frequent objections
  const frequentObjections = data.patterns
    .filter(p => (p.intent === "objeção" || p.intent === "resistência") && p.frequencia >= 2)
    .slice(0, 5);

  if (frequentObjections.length > 0) {
    context += "\n\nOBJEÇÕES MAIS FREQUENTES dos clientes (prepare contra-argumentos DIFERENTES e mais fortes):";
    frequentObjections.forEach((p, i) => {
      context += `\n${i + 1}. "${p.mensagem}" (apareceu ${p.frequencia}x, score médio: ${p.scoreMedio}%)`;
      if (p.melhorResposta) {
        context += `\n   → Melhor resposta anterior: "${p.melhorResposta.substring(0, 200)}"`;
        context += "\n   → EVOLUA esta resposta, não repita igual!";
      }
    });
  }

  // Frequent intents
  const intentCounts: Record<string, number> = {};
  data.patterns.forEach(p => {
    intentCounts[p.intent] = (intentCounts[p.intent] || 0) + p.frequencia;
  });
  const topIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topIntents.length > 0) {
    context += `\n\nINTENÇÕES MAIS COMUNS: ${topIntents.map(([k, v]) => `${k} (${v}x)`).join(", ")}`;
  }

  // Session stats
  if (data.sessions.length > 0) {
    const recent = data.sessions.slice(-10);
    const avgRecent = Math.round(recent.reduce((s, r) => s + r.avgScore, 0) / recent.length);
    context += `\n\nESTATÍSTICAS: ${data.totalNegotiations} negociações, score médio: ${data.avgClosingScore}%, últimas 10: ${avgRecent}%`;

    if (avgRecent > data.avgClosingScore) {
      context += "\n→ EVOLUÇÃO POSITIVA! Continue intensificando a abordagem.";
    } else {
      context += "\n→ PERFORMANCE ESTAGNADA. Mude a estratégia: use mais provas sociais, urgência real e condições exclusivas.";
    }
  }

  context += "\n--- FIM DO APRENDIZADO ---";
  return context;
}

// Simple similarity check (Jaccard on words)
function similarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ---- UI Component ----

interface EvolutionPanelProps {
  currentEntries: Array<{ remetente_tipo: string; score?: number; intent?: string }>;
}

export function NegotiationEvolutionPanel({ currentEntries }: EvolutionPanelProps) {
  const data = loadLearningData();
  const clientScores = currentEntries.filter(e => e.remetente_tipo === "cliente" && e.score !== undefined);

  if (clientScores.length === 0 && data.totalNegotiations === 0) return null;

  // Current session evolution
  const scores = clientScores.map(e => e.score || 0);
  const firstScore = scores[0] || 0;
  const lastScore = scores[scores.length - 1] || 0;
  const avgCurrent = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const trend = scores.length >= 2 ? lastScore - firstScore : 0;

  // Global evolution
  const globalAvg = data.avgClosingScore || 0;
  const improvement = data.sessions.length >= 3
    ? Math.round(
        data.sessions.slice(-3).reduce((s, r) => s + r.avgScore, 0) / 3
        - data.sessions.slice(0, 3).reduce((s, r) => s + r.avgScore, 0) / Math.min(3, data.sessions.length)
      )
    : 0;

  // Top patterns
  const topPatterns = data.patterns
    .filter(p => p.frequencia >= 2)
    .slice(0, 3);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Evolução da Negociação
          {data.totalNegotiations > 0 && (
            <Badge variant="outline" className="text-[10px] ml-auto">
              {data.totalNegotiations} negociações aprendidas
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current session metrics */}
        {scores.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-[10px] text-muted-foreground">Score Atual</p>
              <p className="text-lg font-bold text-foreground">{lastScore}%</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-[10px] text-muted-foreground">Média Sessão</p>
              <p className="text-lg font-bold text-foreground">{avgCurrent}%</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-[10px] text-muted-foreground">Tendência</p>
              <div className="flex items-center justify-center gap-1">
                {trend > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : trend < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : (
                  <Target className="h-4 w-4 text-amber-500" />
                )}
                <span className={`text-lg font-bold ${trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-amber-500"}`}>
                  {trend > 0 ? "+" : ""}{trend}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Score evolution bar */}
        {scores.length >= 2 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Evolução do score</span>
              <span>{firstScore}% → {lastScore}%</span>
            </div>
            <div className="flex items-center gap-0.5 h-3">
              {scores.map((s, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-all ${
                    s >= 80 ? "bg-red-500" : s >= 60 ? "bg-orange-500" : s >= 40 ? "bg-amber-400" : s >= 20 ? "bg-blue-400" : "bg-blue-300"
                  }`}
                  style={{ height: `${Math.max(20, (s / 100) * 100)}%` }}
                  title={`Msg ${i + 1}: ${s}%`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Global AI learning stats */}
        {data.totalNegotiations > 0 && (
          <div className="border-t pt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-[10px]">
              <BarChart3 className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">Score global:</span>
              <span className="font-semibold text-foreground">{globalAvg}%</span>
              {improvement !== 0 && (
                <Badge variant="outline" className={`text-[9px] ${improvement > 0 ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}`}>
                  {improvement > 0 ? "+" : ""}{improvement}% evolução
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">Padrões aprendidos:</span>
              <span className="font-semibold text-foreground">{data.patterns.length}</span>
            </div>
          </div>
        )}

        {/* Top frequent patterns */}
        {topPatterns.length > 0 && (
          <div className="border-t pt-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Objeções mais frequentes:</p>
            <div className="space-y-1">
              {topPatterns.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <Badge variant="secondary" className="text-[9px] shrink-0">{p.frequencia}x</Badge>
                  <span className="text-foreground truncate">"{p.mensagem}"</span>
                  <Progress value={p.scoreMedio} className="w-12 h-1.5 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
