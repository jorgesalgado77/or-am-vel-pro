import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
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
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  FileDown,
} from "lucide-react";
import {
  ListTodo,
  Headset,
  GraduationCap,
  DollarSign,
  Users,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingAI, type AIMessage } from "@/hooks/useOnboardingAI";
import { useTenant } from "@/contexts/TenantContext";
import { useApiKeys } from "@/hooks/useApiKeys";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import { toast } from "sonner";

const ONBOARDING_STEPS = [
  { key: "company_info", label: "Dados da loja" },
  { key: "openai_api", label: "IA de vendas" },
  { key: "whatsapp_api", label: "WhatsApp" },
  { key: "whatsapp_connected", label: "WhatsApp ativo" },
  { key: "resend_api", label: "Email" },
  { key: "pdf_configured", label: "PDF" },
];

const POSITION_KEY = "mia_fab_position";

function loadSavedPosition(): { x: number; y: number } | null {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

// Detect reduced motion preference for low-end devices
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function OnboardingAIAssistant() {
  const { tenantId } = useTenant();
  const { messages, loading, context, sendMessage, configureVendaZap, runTests, suggestFirstProject, navigateTo, pendingItems } = useOnboardingAI(tenantId);
  const { keys } = useApiKeys(tenantId);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [compactMode, setCompactMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [missingKeysDismissed, setMissingKeysDismissed] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(loadSavedPosition);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; dragging: boolean }>({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, dragging: false });
  const fabRef = useRef<HTMLButtonElement>(null);

  const hasOpenAI = keys.some(k => k.provider === "openai" && k.is_active);
  const hasWhatsApp = Boolean(context?.completedSteps?.includes("whatsapp_api") || context?.completedSteps?.includes("whatsapp_connected"));
  const missingCriticalKeys = !hasOpenAI || !hasWhatsApp;

  const userScrolledUp = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [fabUnread, setFabUnread] = useState(0);
  const prevMsgCount = useRef(0);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevLastAssistantId = useRef<string | null>(null);
  const initializedUnread = useRef(false);

  // Init notification audio (lazy)
  useEffect(() => {
    notificationAudioRef.current = new Audio("/sounds/mia-notification.wav");
    notificationAudioRef.current.volume = 0.5;
  }, []);

  // Count new messages while scrolled up or closed
  useEffect(() => {
    // Skip the first hydration to avoid counting cached messages as "new"
    if (!initializedUnread.current) {
      initializedUnread.current = true;
      prevMsgCount.current = messages.length;
      return;
    }
    const newCount = messages.length - prevMsgCount.current;
    prevMsgCount.current = messages.length;
    if (newCount > 0) {
      if (userScrolledUp.current) setUnreadCount(prev => prev + newCount);
      if (!open) setFabUnread(prev => prev + newCount);
    }
  }, [messages.length, open]);

  // Notification sound when chat is closed
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAssistant) return;
    if (prevLastAssistantId.current && prevLastAssistantId.current !== lastAssistant.id && !open) {
      notificationAudioRef.current?.play().catch(() => {});
    }
    prevLastAssistantId.current = lastAssistant.id;
  }, [messages, open]);

  // Native scroll handler on viewport div
  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledUp.current = !nearBottom;
    setShowScrollBtn(!nearBottom);
    if (nearBottom) setUnreadCount(0);
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
    userScrolledUp.current = false;
    setShowScrollBtn(false);
    setUnreadCount(0);
  }, []);

  // Auto-scroll on new messages
  useLayoutEffect(() => {
    if (userScrolledUp.current) return;
    requestAnimationFrame(() => scrollToBottom());
  }, [messages.length, loading, scrollToBottom]);

  // Focus input & clear FAB unread when opened
  useEffect(() => {
    if (open) {
      setFabUnread(0);
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

  // Drag handlers for FAB
  const handlePointerDown = (e: React.PointerEvent) => {
    const el = fabRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPosX: rect.left, startPosY: rect.top,
      dragging: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.startX === 0 && d.startY === 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.dragging = true;
    if (!d.dragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - 56, d.startPosX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 56, d.startPosY + dy));
    setFabPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const el = fabRef.current;
    if (el) el.releasePointerCapture(e.pointerId);
    if (!dragRef.current.dragging) {
      setOpen(true);
    } else if (fabPos) {
      localStorage.setItem(POSITION_KEY, JSON.stringify(fabPos));
    }
    dragRef.current = { startX: 0, startY: 0, startPosX: 0, startPosY: 0, dragging: false };
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    sendMessage(msg);
  };

  const completedSteps = context?.completedSteps || [];
  const progress = (completedSteps.length / ONBOARDING_STEPS.length) * 100;

  const exportConversationPdf = useCallback((filter: "all" | "today" | "this_month" | "last_month" | "custom", startDate?: Date, endDate?: Date) => {
    let filtered = [...messages];
    const now = new Date();

    if (filter === "today") {
      const todayStr = now.toISOString().slice(0, 10);
      filtered = filtered.filter(m => new Date(m.timestamp).toISOString().slice(0, 10) === todayStr);
    } else if (filter === "this_month") {
      filtered = filtered.filter(m => {
        const d = new Date(m.timestamp);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (filter === "last_month") {
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      filtered = filtered.filter(m => {
        const d = new Date(m.timestamp);
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
      });
    } else if (filter === "custom" && startDate && endDate) {
      const start = startDate.getTime();
      const end = endDate.getTime() + 86400000;
      filtered = filtered.filter(m => {
        const t = new Date(m.timestamp).getTime();
        return t >= start && t < end;
      });
    }

    if (filtered.length === 0) {
      toast.info("Nenhuma mensagem encontrada para o período selecionado.");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    doc.setFontSize(16);
    doc.text("Conversa com Mia — Assistente IA", margin, y);
    y += 8;
    doc.setFontSize(9);
    const filterLabels: Record<string, string> = {
      all: "Histórico completo",
      today: `Hoje — ${now.toLocaleDateString("pt-BR")}`,
      this_month: `Mês atual — ${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
      last_month: "Mês anterior",
      custom: startDate && endDate ? `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}` : "Período personalizado",
    };
    doc.text(`Período: ${filterLabels[filter]}  •  ${filtered.length} mensagem(ns)`, margin, y);
    y += 6;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    for (const msg of filtered) {
      const prefix = msg.role === "user" ? "Você" : "Mia";
      const time = new Date(msg.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const plainText = msg.content.replace(/[#*_~`>|[\]()!]/g, "").replace(/\n{2,}/g, "\n");

      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(`${prefix} • ${time}`, margin, y);
      y += 4;

      doc.setFontSize(9);
      doc.setTextColor(msg.role === "user" ? 30 : 60);
      const lines = doc.splitTextToSize(plainText, maxWidth);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - 15) {
          doc.addPage();
          y = 15;
        }
        doc.text(line, margin, y);
        y += 4;
      }
      y += 4;
    }

    doc.save(`mia-conversa-${filter}-${now.toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exportado com sucesso!");
  }, [messages]);

  const [exportDateStart, setExportDateStart] = useState("");
  const [exportDateEnd, setExportDateEnd] = useState("");

  if (!tenantId) return null;

  const fabStyle: React.CSSProperties = fabPos
    ? { position: "fixed", left: fabPos.x, top: fabPos.y, bottom: "auto", right: "auto" }
    : { position: "fixed", bottom: 24, right: 24 };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          ref={fabRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={fabStyle}
          className="z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center justify-center group touch-none select-none cursor-grab active:cursor-grabbing"
        >
          <Bot className="h-6 w-6 group-hover:hidden" />
          <MessageCircle className="h-6 w-6 hidden group-hover:block" />
          {(messages.length === 0 || fabUnread > 0) && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive flex items-center justify-center text-[10px] font-bold text-destructive-foreground animate-pulse px-1">
              {fabUnread > 0 ? fabUnread : ""}
            </span>
          )}
        </button>
      )}

      {/* Chat panel — responsive: full-screen on mobile, floating on desktop */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-background shadow-2xl",
            // Mobile: full viewport
            "inset-0 rounded-none",
            // sm+: floating bottom-right card with explicit height
            "sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[400px] sm:h-[min(85dvh,680px)] sm:rounded-2xl",
            !prefersReducedMotion && "animate-in slide-in-from-bottom-4 duration-300"
          )}
        >
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="h-9 w-9 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary-foreground">Mia — Assistente IA</p>
              <p className="text-xs text-primary-foreground/70">Configuração inteligente</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setCompactMode(v => !v)}
              title={compactMode ? "Expandir progresso" : "Modo compacto"}
            >
              {compactMode ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress bar — hidden in compact mode */}
          {!compactMode && (
            <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">Progresso</span>
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
                      {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      {step.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Missing API keys alert */}
          {missingCriticalKeys && !missingKeysDismissed && (
            <div className="px-3 py-2 border-b border-border bg-destructive/5 shrink-0">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {!hasOpenAI && !hasWhatsApp
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

          {/* ===== Messages — native scroll, isolated flex area ===== */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              ref={viewportRef}
              onScroll={handleScroll}
              className="absolute inset-0 overflow-y-auto overscroll-contain scroll-smooth"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="p-3 space-y-3">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {loading && (
                  <div className="flex items-start gap-2 px-1 py-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary animate-pulse" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2 space-y-1">
                      <div className="flex gap-1 items-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">Mia está digitando...</p>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} className="h-1" />
              </div>
            </div>

            {/* Scroll-to-bottom FAB */}
            {showScrollBtn && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 h-8 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center gap-1 px-3 hover:scale-105 active:scale-95 transition-transform"
                aria-label="Ir para mensagens recentes"
              >
                <ArrowDown className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold leading-none">{unreadCount}</span>
                )}
              </button>
            )}
          </div>

          {/* Quick actions (early onboarding) */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5 shrink-0">
              {["Alto Padrão", "Popular", "Corporativo", "Misto"].map((type) => (
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

          {/* Advanced action buttons */}
          {messages.length > 2 && (hasOpenAI || hasWhatsApp) && (
            <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5 shrink-0">
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={configureVendaZap} disabled={loading}>
                <Zap className="h-3 w-3" /> Configurar VendaZap
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={runTests} disabled={loading}>
                <FlaskConical className="h-3 w-3" /> Executar Testes
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={suggestFirstProject} disabled={loading}>
                <FolderPlus className="h-3 w-3" /> Primeiro Projeto
              </Button>
            </div>
          )}

          {/* Navigation quick actions — always visible */}
          <div className="px-3 py-2 border-t border-border bg-muted/20 shrink-0">
            {/* Pending items summary */}
            {pendingItems.length > 0 && pendingItems.length < 6 && (
              <div className="mb-2 p-2 rounded-lg bg-accent/30 border border-accent/50">
                <p className="text-[10px] font-semibold text-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {pendingItems.length} pendência{pendingItems.length > 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {pendingItems.map((item) => (
                    <Badge key={item.key} variant="outline" className="text-[9px] py-0 gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400">
                      <Circle className="h-2 w-2" />
                      {item.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Quick navigation buttons */}
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => sendMessage("criar tarefa")}>
                <ListTodo className="h-3 w-3" /> Criar Tarefa
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); navigateTo("tarefas"); }}>
                <ListTodo className="h-3 w-3" /> Tarefas
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); navigateTo("suporte"); }}>
                <Headset className="h-3 w-3" /> Suporte
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); navigateTo("tutoriais"); }}>
                <GraduationCap className="h-3 w-3" /> Tutoriais
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); navigateTo("financeiro"); }}>
                <DollarSign className="h-3 w-3" /> Financeiro
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); navigateTo("configuracoes"); }}>
                <Settings className="h-3 w-3" /> Config
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={() => sendMessage("criar lembrete: ")}>
                <Bell className="h-3 w-3" /> Lembrete
              </Button>
            </div>
          </div>

          {/* Input — always pinned at bottom with safe area */}
          <div className="p-3 border-t border-border bg-background shrink-0" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
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
});

const RenderMarkdown = memo(function RenderMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm prose-slate dark:prose-invert max-w-none [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_strong]:font-semibold [&_a]:underline [&_a]:text-inherit [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-xs [&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
