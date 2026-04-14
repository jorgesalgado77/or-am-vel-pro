import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CARD_VISIBILITY_STORAGE_PREFIX,
  GLOBAL_TOGGLE_EVENT,
  CARD_TOGGLE_EVENT,
  normalizeCardKey,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Floating button to collapse or expand ALL cards on the current page.
 * Persists via the same localStorage keys used by individual cards.
 */
export function GlobalCardToggle() {
  const { user } = useAuth();
  const [allCollapsed, setAllCollapsed] = useState(false);

  const getRoutePrefix = useCallback(() => {
    const userKey = normalizeCardKey(user?.id || window.localStorage.getItem("current_user_id") || "anon");
    const routeKey = normalizeCardKey(window.location.pathname || "global");
    return `${CARD_VISIBILITY_STORAGE_PREFIX}:${userKey}:${routeKey}:`;
  }, [user?.id]);

  const checkState = useCallback(() => {
    const prefix = getRoutePrefix();
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    if (keys.length === 0) {
      setAllCollapsed(false);
      return;
    }
    const allHidden = keys.every((k) => localStorage.getItem(k) === "1");
    setAllCollapsed(allHidden);
  }, [getRoutePrefix]);

  useEffect(() => {
    checkState();
    window.addEventListener(CARD_TOGGLE_EVENT, checkState);
    return () => window.removeEventListener(CARD_TOGGLE_EVENT, checkState);
  }, [checkState]);

  const toggleAll = useCallback(() => {
    const action = allCollapsed ? "expand" : "collapse";

    // Also bulk-update localStorage for any already-registered keys
    const prefix = getRoutePrefix();
    const newVal = action === "collapse" ? "1" : "0";
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        localStorage.setItem(k, newVal);
      }
    }

    window.dispatchEvent(new CustomEvent(GLOBAL_TOGGLE_EVENT, { detail: { action } }));
    setAllCollapsed(!allCollapsed);
  }, [allCollapsed, getRoutePrefix]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleAll}
          className="fixed bottom-6 left-4 z-40 h-9 w-9 rounded-full shadow-lg border-border/60 bg-card/90 backdrop-blur-sm hover:bg-muted"
          aria-label={allCollapsed ? "Expandir todos os cards" : "Recolher todos os cards"}
        >
          {allCollapsed ? (
            <ChevronsUpDown className="h-4 w-4 text-foreground" />
          ) : (
            <ChevronsDownUp className="h-4 w-4 text-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {allCollapsed ? "Expandir todos os cards" : "Recolher todos os cards"}
      </TooltipContent>
    </Tooltip>
  );
}
