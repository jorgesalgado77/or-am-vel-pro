import {memo, useId} from "react";
import {Button} from "@/components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {Lightbulb, Copy, Loader2} from "lucide-react";
import {MIAFeedback} from "@/components/mia/MIAFeedback";

interface Props {
  suggestion: string;
  loading: boolean;
  tipoCopy: string;
  discProfile?: string;
  tenantId?: string | null;
  userId?: string;
  onUse: () => void;
}

const TIPO_LABELS: Record<string, string> = {
  reativacao: "Reativação",
  fechamento: "🎯 Fechamento",
  reuniao: "📹 Reunião/Deal Room",
  urgencia: "⚡ Urgência",
  objecao: "🛡️ Objeção",
  geral: "Geral",
  resposta_automatica: "🤖 Auto-Pilot",
};

const DISC_LABELS: Record<string, { label: string; emoji: string; desc: string }> = {
  D: { label: "Dominante", emoji: "🔴", desc: "Direto, decisivo, orientado a resultados" },
  I: { label: "Influente", emoji: "🟡", desc: "Entusiasmado, sociável, emotivo" },
  S: { label: "Estável", emoji: "🟢", desc: "Cauteloso, busca segurança e garantias" },
  C: { label: "Conforme", emoji: "🔵", desc: "Analítico, detalhista, precisa de dados" },
};

export const ChatAISuggestion = memo(function ChatAISuggestion({ suggestion, loading, tipoCopy, discProfile, tenantId, userId, onUse }: Props) {
  const responseId = useId();

  if (!loading && !suggestion) return null;

  const disc = discProfile ? DISC_LABELS[discProfile] : null;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">Sugestão da IA</span>
        {tipoCopy && (
          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {TIPO_LABELS[tipoCopy] || tipoCopy}
          </span>
        )}
        {disc && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-medium cursor-help">
                {disc.emoji} DISC: {disc.label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              <p className="font-semibold">{disc.emoji} Perfil {disc.label}</p>
              <p className="text-muted-foreground">{disc.desc}</p>
              <p className="mt-1 text-primary">Tom e argumentos adaptados automaticamente</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Analisando conversa{discProfile ? " e perfil DISC" : ""}...</span>
        </div>
      ) : (
        <>
          <p className="text-xs text-foreground leading-relaxed mb-2 whitespace-pre-wrap">
            {suggestion}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
              onClick={onUse}
            >
              <Copy className="h-3 w-3" />
              Usar resposta
            </Button>
            {tenantId && userId && (
              <MIAFeedback
                tenantId={tenantId}
                userId={userId}
                context="vendazap"
                responseId={`suggestion-${responseId}-${suggestion.slice(0, 20)}`}
                actionTaken={tipoCopy || "vendazap-suggestion"}
                compact
              />
            )}
          </div>
        </>
      )}
    </div>
  );
});
