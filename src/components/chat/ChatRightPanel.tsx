import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelRightClose, PanelRightOpen, Bot, Brain, BarChart3 } from "lucide-react";
import { AutoPilotHistory } from "./AutoPilotHistory";
import { ChatAISuggestion } from "./ChatAISuggestion";
import { ChatDealInsights } from "./ChatDealInsights";
import type { ChatConversation } from "./types";

const DISC_PROFILES: Record<string, { label: string; emoji: string; color: string; tips: string }> = {
  D: { label: "Dominante", emoji: "🔴", color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800", tips: "Seja objetivo, mostre ROI e resultados rápidos" },
  I: { label: "Influente", emoji: "🟡", color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800", tips: "Use entusiasmo, depoimentos e exclusividade" },
  S: { label: "Estável", emoji: "🟢", color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800", tips: "Ofereça garantias, prazos claros e suporte" },
  C: { label: "Conforme", emoji: "🔵", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800", tips: "Apresente dados, comparativos e especificações" },
};

interface Props {
  conversation: ChatConversation;
  tenantId: string | null;
  messageCount: number;
  aiSuggestion: string;
  aiLoading: boolean;
  aiTipoCopy: string;
  aiDiscProfile?: string;
  onUseSuggestion: () => void;
}

export function ChatRightPanel({
  conversation, tenantId, messageCount,
  aiSuggestion, aiLoading, aiTipoCopy, aiDiscProfile, onUseSuggestion,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const disc = aiDiscProfile ? DISC_PROFILES[aiDiscProfile] : null;

  if (!expanded) {
    return (
      <div className="shrink-0 flex flex-col items-center py-2 px-1 border-l border-border bg-card gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setExpanded(true)}
          title="Expandir painel IA"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <div className="flex flex-col gap-2 items-center mt-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <Bot className="h-4 w-4 text-muted-foreground" />
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 w-[320px] border-l border-border bg-card flex flex-col min-h-0 hidden lg:flex">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-primary" />
          Assistente IA
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setExpanded(false)}
          title="Recolher painel"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {/* DISC Profile */}
          {disc && (
            <div className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${disc.color}`}>
              <span className="text-sm">{disc.emoji}</span>
              <div className="flex-1 min-w-0">
                <span className="font-semibold">DISC: {disc.label}</span>
                <p className="opacity-80 mt-0.5">{disc.tips}</p>
              </div>
            </div>
          )}

          {/* AI Suggestion */}
          <ChatAISuggestion
            suggestion={aiSuggestion}
            loading={aiLoading}
            tipoCopy={aiTipoCopy}
            discProfile={aiDiscProfile}
            onUse={onUseSuggestion}
          />

          {/* Deal Insights */}
          <ChatDealInsights
            conversation={conversation}
            tenantId={tenantId}
            messageCount={messageCount}
          />

          {/* Auto-Pilot History */}
          <AutoPilotHistory trackingId={conversation.id} tenantId={tenantId} />
        </div>
      </ScrollArea>
    </div>
  );
}
