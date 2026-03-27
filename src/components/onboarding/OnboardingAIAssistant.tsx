import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Send,
  X,
  MessageCircle,
  Sparkles,
  CheckCircle2,
  Circle,
  Loader2,
  Settings,
  AlertTriangle,
  Zap,
  FlaskConical,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingAI, type AIMessage } from "@/hooks/useOnboardingAI";
import { useTenant } from "@/contexts/TenantContext";
import { useApiKeys } from "@/hooks/useApiKeys";

const ONBOARDING_STEPS = [
  { key: "company_info", label: "Dados da loja" },
  { key: "openai_api", label: "IA de vendas" },
  { key: "evolution_api", label: "WhatsApp" },
  { key: "whatsapp_connected", label: "WhatsApp ativo" },
  { key: "resend_api", label: "Email" },
];

export function OnboardingAIAssistant() {
  const { tenantId } = useTenant();
  const { messages, loading, context, sendMessage, configureVendaZap, runTests, suggestFirstProject } = useOnboardingAI(tenantId);
  const { keys } = useApiKeys(tenantId);
  const [open, setOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [missingKeysDismissed, setMissingKeysDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasOpenAI = keys.some(k => k.provider === "openai" && k.is_active);
  const hasEvolution = keys.some(k => k.provider === "evolution" && k.is_active);
  const missingCriticalKeys = !hasOpenAI || !hasEvolution;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Auto-open on first visit
  useEffect(() => {
    const shown = sessionStorage.getItem("onboarding_ai_shown");
    if (!shown && tenantId) {
      const timer = setTimeout(() => {
        setOpen(true);
        sessionStorage.setItem("onboarding_ai_shown", "1");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [tenantId]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    sendMessage(msg);
  };

  const completedSteps = context?.completedSteps || [];
  const progress = (completedSteps.length / ONBOARDING_STEPS.length) * 100;

  if (!tenantId) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center group"
        >
          <Bot className="h-6 w-6 group-hover:hidden" />
          <MessageCircle className="h-6 w-6 hidden group-hover:block" />
          {messages.length === 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive animate-pulse" />
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[600px] rounded-2xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="h-9 w-9 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary-foreground">
                Mia — Assistente IA
              </p>
              <p className="text-xs text-primary-foreground/70">
                Configuração inteligente
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Progresso
              </span>
              <span className="text-xs font-semibold text-foreground">
                {completedSteps.length}/{ONBOARDING_STEPS.length}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ONBOARDING_STEPS.map((step) => {
                const done = completedSteps.includes(step.key);
                return (
                  <Badge
                    key={step.key}
                    variant={done ? "default" : "outline"}
                    className={cn(
                      "text-[10px] gap-1 py-0",
                      done && "bg-primary/15 text-primary border-primary/30"
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                    {step.label}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Missing API keys alert */}
          {missingCriticalKeys && !missingKeysDismissed && (
            <div className="px-3 py-2 border-b border-border bg-destructive/5 shrink-0">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {!hasOpenAI && !hasEvolution
                      ? "APIs de IA e WhatsApp não configuradas"
                      : !hasOpenAI
                      ? "API da OpenAI não configurada"
                      : "API do WhatsApp não configurada"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Configure em Configurações &gt; APIs para ativar os módulos.
                  </p>
                  <div className="flex gap-1.5 mt-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={() => {
                        setOpen(false);
                        window.dispatchEvent(new CustomEvent("navigate-to-settings", { detail: { subtab: "apis" } }));
                      }}
                    >
                      <Settings className="h-3 w-3" />
                      Ir para APIs
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setMissingKeysDismissed(true)}
                    >
                      Depois
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick actions */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5 shrink-0">
              {[
                "Alto Padrão",
                "Popular",
                "Corporativo",
                "Misto",
              ].map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => sendMessage(`Minha loja é ${type}`)}
                  disabled={loading}
                >
                  {type}
                </Button>
              ))}
            </div>
          )}

          {/* Advanced action buttons (FASES 6, 7, 8) */}
          {messages.length > 2 && (hasOpenAI || hasEvolution) && (
            <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={configureVendaZap}
                disabled={loading}
              >
                <Zap className="h-3 w-3" />
                Configurar VendaZap
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={runTests}
                disabled={loading}
              >
                <FlaskConical className="h-3 w-3" />
                Executar Testes
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={suggestFirstProject}
                disabled={loading}
              >
                <FolderPlus className="h-3 w-3" />
                Primeiro Projeto
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-border shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 h-9 text-sm"
                disabled={loading}
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!input.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        <RenderMarkdown content={message.content} />
      </div>
    </div>
  );
}

function RenderMarkdown({ content }: { content: string }) {
  // Simple markdown: bold, links, line breaks
  const parts = content.split("\n").map((line, i) => {
    const processed = line
      .replace(
        /\*\*(.*?)\*\*/g,
        '<strong class="font-semibold">$1</strong>'
      )
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" class="underline">$1</a>'
      )
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener" class="underline break-all">$1</a>'
      );
    return (
      <span key={i}>
        <span dangerouslySetInnerHTML={{ __html: processed }} />
        {i < content.split("\n").length - 1 && <br />}
      </span>
    );
  });

  return <>{parts}</>;
}
