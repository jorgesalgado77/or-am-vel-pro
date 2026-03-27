import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PanelRightClose, PanelRightOpen, Bot, Brain, BarChart3, X, Sparkles } from "lucide-react";
import { AutoPilotHistory } from "./AutoPilotHistory";
import { ChatAISuggestion } from "./ChatAISuggestion";
import { ChatDealInsights } from "./ChatDealInsights";
import type { ChatConversation } from "./types";

const DISC_PROFILES: Record<string, { label: string; emoji: string; tips: string }> = {
  D: { label: "Dominante", emoji: "🔴", tips: "Seja objetivo, mostre ROI e resultados rápidos" },
  I: { label: "Influente", emoji: "🟡", tips: "Use entusiasmo, depoimentos e exclusividade" },
  S: { label: "Estável", emoji: "🟢", tips: "Ofereça garantias, prazos claros e suporte" },
  C: { label: "Conforme", emoji: "🔵", tips: "Apresente dados, comparativos e especificações" },
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
  isMobile?: boolean;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export function ChatRightPanel({
  conversation,
  tenantId,
  messageCount,
  aiSuggestion,
  aiLoading,
  aiTipoCopy,
  aiDiscProfile,
  onUseSuggestion,
  isMobile = false,
  mobileOpen = false,
  onMobileOpenChange,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const disc = aiDiscProfile ? DISC_PROFILES[aiDiscProfile] : null;

  const content = (
    <div className="p-3 space-y-3">
      {disc && (
        <div className="px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs flex items-center gap-2">
          <span className="text-sm">{disc.emoji}</span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-foreground">DISC: {disc.label}</span>
            <p className="text-muted-foreground mt-0.5">{disc.tips}</p>
          </div>
        </div>
      )}

      <ChatAISuggestion
        suggestion={aiSuggestion}
        loading={aiLoading}
        tipoCopy={aiTipoCopy}
        discProfile={aiDiscProfile}
        onUse={onUseSuggestion}
      />

      <ChatDealInsights
        conversation={conversation}
        tenantId={tenantId}
        messageCount={messageCount}
      />

      <AutoPilotHistory trackingId={conversation.id} tenantId={tenantId} />
    </div>
  );

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <button
            type="button"
            aria-label="Fechar painel IA"
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={() => onMobileOpenChange?.(false)}
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm border-l border-border bg-card shadow-2xl transition-transform duration-300 md:hidden flex flex-col",
            mobileOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
          )}
        >
          <div className="flex items-center justify-between px-3 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Assistente IA</p>
                <p className="text-[11px] text-muted-foreground">Sugestões e histórico</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMobileOpenChange?.(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">{content}</ScrollArea>
        </aside>
      </>
    );
  }

  if (!expanded) {
    return (
      <div className="hidden md:flex shrink-0 flex-col items-center py-2 px-1 border-l border-border bg-card gap-2">
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
    <div className="hidden md:flex shrink-0 w-[320px] border-l border-border bg-card flex-col min-h-0">
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

      <ScrollArea className="flex-1 min-h-0">{content}</ScrollArea>
    </div>
  );
}
