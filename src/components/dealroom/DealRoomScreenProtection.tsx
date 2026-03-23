import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

interface DealRoomScreenProtectionProps {
  sessionId: string;
  userRole: "projetista" | "cliente";
}

export function DealRoomScreenProtection({ sessionId, userRole }: DealRoomScreenProtectionProps) {
  const notifyScreenshotAttempt = useCallback(async () => {
    toast.error(
      `⚠️ Tentativa de captura de tela detectada pelo ${userRole === "cliente" ? "Cliente" : "Projetista"}!`,
      { duration: 5000, id: "screenshot-warning" }
    );

    // Notify the other side via realtime
    await supabase.from("dealroom_chat_messages" as any).insert({
      session_id: sessionId,
      sender: "sistema",
      message: `⚠️ ALERTA: Tentativa de captura de tela detectada (${userRole}).`,
    });
  }, [sessionId, userRole]);

  useEffect(() => {
    // Block Print Screen and screenshot shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "PrintScreen" ||
        (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) ||
        (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5")) ||
        (e.ctrlKey && e.key === "p") ||
        (e.key === "F12") ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        notifyScreenshotAttempt();
        return false;
      }
    };

    // Block right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast.warning("Menu de contexto desabilitado nesta sala.", { id: "context-block" });
      return false;
    };

    // Block dev tools via resize detection
    let devToolsOpen = false;
    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      if ((widthThreshold || heightThreshold) && !devToolsOpen) {
        devToolsOpen = true;
        toast.error("⚠️ Ferramentas de desenvolvedor detectadas! Feche para continuar.", {
          duration: 10000,
          id: "devtools-warning",
        });
        notifyScreenshotAttempt();
      } else if (!widthThreshold && !heightThreshold) {
        devToolsOpen = false;
      }
    };

    // Block copy/paste of screen content
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      notifyScreenshotAttempt();
    };

    // CSS-based protections
    const style = document.createElement("style");
    style.id = "dealroom-protection-styles";
    style.textContent = `
      .dealroom-protected {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
      }
      @media print {
        .dealroom-protected * {
          display: none !important;
        }
        body::after {
          content: "Impressão não permitida nesta sala.";
          display: block;
          text-align: center;
          padding: 50px;
          font-size: 24px;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.classList.add("dealroom-protected");

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("copy", handleCopy, true);
    const devToolsInterval = setInterval(checkDevTools, 1000);

    // Visibility API - blur detection (potential screenshot on mobile)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Could be a screenshot attempt on mobile
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(devToolsInterval);
      document.body.classList.remove("dealroom-protected");
      const protectionStyle = document.getElementById("dealroom-protection-styles");
      if (protectionStyle) protectionStyle.remove();
    };
  }, [notifyScreenshotAttempt]);

  return null; // This is a behavior-only component
}
