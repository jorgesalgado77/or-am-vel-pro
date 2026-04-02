/**
 * MIAFeedback — Inline 👍/👎 buttons for AI responses.
 * Registers feedback as learning events via MIALearningEngine.
 * Also saves preference in MIAMemoryEngine for personalization.
 *
 * Usage:
 *   <MIAFeedback
 *     tenantId="..."
 *     userId="..."
 *     context="vendazap"
 *     responseId="unique-id"
 *     actionTaken="vendazap-ai"
 *   />
 */

import { useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMIALearningEngine } from "@/services/mia/MIALearningEngine";
import { getMIAMemoryEngine } from "@/services/mia/MIAMemoryEngine";
import type { MIAContextType } from "@/services/mia/types";

interface MIAFeedbackProps {
  tenantId: string;
  userId: string;
  context: MIAContextType;
  /** Unique identifier for this response (prevents duplicate feedback) */
  responseId: string;
  /** What action/engine generated this response */
  actionTaken: string;
  /** Optional extra metadata */
  metadata?: Record<string, unknown>;
  /** Compact mode for inline use */
  compact?: boolean;
  /** Custom class */
  className?: string;
}

export function MIAFeedback({
  tenantId,
  userId,
  context,
  responseId,
  actionTaken,
  metadata,
  compact = false,
  className,
}: MIAFeedbackProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);

  const handleFeedback = useCallback(
    (type: "positive" | "negative") => {
      if (feedback) return; // Already voted
      setFeedback(type);

      const score = type === "positive" ? 1 : -1;
      const learning = getMIALearningEngine();
      const memory = getMIAMemoryEngine();

      // Register learning event (fire-and-forget)
      learning.registerEventAsync({
        tenant_id: tenantId,
        user_id: userId,
        event_type: "user_feedback",
        context: {
          engine: context,
          responseId,
          feedbackType: type,
          ...metadata,
        },
        action_taken: actionTaken,
        result: type,
        score: score as -1 | 0 | 1,
      });

      // Update memory preference (fire-and-forget)
      void memory.saveMemory({
        tenant_id: tenantId,
        user_id: userId,
        memory_type: "user_preference",
        key: `feedback_${context}_${actionTaken}`,
        value: {
          lastFeedback: type,
          lastResponseId: responseId,
          updatedAt: new Date().toISOString(),
        },
        relevance_score: type === "positive" ? 0.8 : 0.6,
      });
    },
    [tenantId, userId, context, responseId, actionTaken, metadata, feedback]
  );

  if (!tenantId || !userId) return null;

  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const btnSize = compact ? "h-6 w-6" : "h-7 w-7";

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          btnSize,
          "rounded-full transition-all",
          feedback === "positive"
            ? "bg-emerald-500/20 text-emerald-500"
            : feedback
              ? "opacity-30 cursor-default"
              : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
        )}
        onClick={() => handleFeedback("positive")}
        disabled={feedback !== null}
        title="Resposta útil"
      >
        <ThumbsUp className={iconSize} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          btnSize,
          "rounded-full transition-all",
          feedback === "negative"
            ? "bg-red-500/20 text-red-500"
            : feedback
              ? "opacity-30 cursor-default"
              : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
        )}
        onClick={() => handleFeedback("negative")}
        disabled={feedback !== null}
        title="Resposta não ajudou"
      >
        <ThumbsDown className={iconSize} />
      </Button>
      {feedback && (
        <span className="text-[10px] text-muted-foreground ml-1 animate-in fade-in">
          {feedback === "positive" ? "Obrigado!" : "Vamos melhorar"}
        </span>
      )}
    </div>
  );
}
