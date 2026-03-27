import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, RefreshCw, User, AlertTriangle } from "lucide-react";

export interface QualityValidationResult {
  passed: boolean;
  reason: string;
  attempts: number;
  decisionMaker: string | null;
  discProfile: string | null;
  intent: string | null;
}

interface QualityValidatorPanelProps {
  result: QualityValidationResult | null;
}

const INTENT_LABELS: Record<string, string> = {
  desinteresse_explicit: "Desinteresse explícito",
  atendimento_remoto: "Atendimento remoto",
  orcamento: "Orçamento",
  fechamento: "Fechamento",
  preco: "Negociação de preço",
  enviar_preco: "Pediu preço por mensagem",
  duvida: "Dúvida",
  objecao: "Objeção",
  saudacao: "Saudação",
  outro: "Outro",
};

const DECISION_MAKER_LABELS: Record<string, { label: string; emoji: string }> = {
  marido: { label: "Marido", emoji: "👨" },
  esposa: { label: "Esposa", emoji: "👩" },
  socio: { label: "Sócio(a)", emoji: "🤝" },
  arquiteto: { label: "Arquiteto(a)", emoji: "📐" },
  outro: { label: "Outro decisor", emoji: "👤" },
};

export function QualityValidatorPanel({ result }: QualityValidatorPanelProps) {
  if (!result) return null;

  const passed = result.passed;
  const decisionMakerMeta = result.decisionMaker ? DECISION_MAKER_LABELS[result.decisionMaker] || DECISION_MAKER_LABELS.outro : null;

  return (
    <Card className={`border ${passed ? "border-green-500/40 bg-green-50/50 dark:bg-green-950/20" : "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20"}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs flex items-center gap-2">
          {passed ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          )}
          <span className={passed ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
            Validador de Qualidade
          </span>
          <Badge
            variant="outline"
            className={`ml-auto text-[10px] ${passed ? "border-green-500/50 text-green-700 dark:text-green-400" : "border-amber-500/50 text-amber-700 dark:text-amber-400"}`}
          >
            {passed ? "✅ Aprovado" : "⚠️ Corrigido"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            <span>{result.attempts === 0 ? "1ª tentativa" : `${result.attempts + 1} tentativas`}</span>
          </div>

          {result.intent && (
            <Badge variant="secondary" className="text-[10px] h-5">
              🎯 {INTENT_LABELS[result.intent] || result.intent}
            </Badge>
          )}

          {result.discProfile && (
            <Badge variant="secondary" className="text-[10px] h-5">
              🧠 DISC: {result.discProfile}
            </Badge>
          )}

          {decisionMakerMeta && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {decisionMakerMeta.emoji} Co-decisor: {decisionMakerMeta.label}
            </Badge>
          )}
        </div>

        {/* Reason */}
        {!passed && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20 rounded px-2 py-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Problema detectado: <strong>{result.reason}</strong> — resposta foi corrigida automaticamente.</span>
          </div>
        )}

        {passed && (
          <p className="text-[11px] text-green-700 dark:text-green-400">
            Resposta passou em todas as verificações: sem frases genéricas, contextualizada e não repetida.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
