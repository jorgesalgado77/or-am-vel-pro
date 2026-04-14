import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CARD_VISIBILITY_STORAGE_PREFIX,
  GLOBAL_TOGGLE_EVENT,
  CARD_TOGGLE_EVENT,
  normalizeCardKey,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const POSITION_STORAGE_KEY = "global-toggle-pos";

function getStoredPosition(userId: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(`${POSITION_STORAGE_KEY}:${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function storePosition(userId: string, pos: { x: number; y: number }) {
  try {
    localStorage.setItem(`${POSITION_STORAGE_KEY}:${userId}`, JSON.stringify(pos));
  } catch {}
}

export function GlobalCardToggle() {
  const { user } = useAuth();
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  const userKey = user?.id || localStorage.getItem("current_user_id") || "anon";

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    return getStoredPosition(userKey) || { x: window.innerWidth > 0 ? 16 : 16, y: window.innerHeight > 0 ? window.innerHeight - 80 : 600 };
  });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const hasDraggedRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Entrance animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Restore position on user change
  useEffect(() => {
    const stored = getStoredPosition(userKey);
    if (stored) setPos(stored);
  }, [userKey]);

  const getRoutePrefix = useCallback(() => {
    const uKey = normalizeCardKey(userKey);
    const routeKey = normalizeCardKey(window.location.pathname || "global");
    return `${CARD_VISIBILITY_STORAGE_PREFIX}:${uKey}:${routeKey}:`;
  }, [userKey]);

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
    if (hasDraggedRef.current) return; // prevent toggle after drag
    const action = allCollapsed ? "expand" : "collapse";
    const prefix = getRoutePrefix();
    const newVal = action === "collapse" ? "1" : "0";
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.setItem(k, newVal);
    }
    window.dispatchEvent(new CustomEvent(GLOBAL_TOGGLE_EVENT, { detail: { action } }));
    setAllCollapsed(!allCollapsed);
  }, [allCollapsed, getRoutePrefix]);

  // Clamp position to viewport
  const clamp = useCallback((x: number, y: number) => {
    const size = 36;
    return {
      x: Math.max(4, Math.min(x, window.innerWidth - size - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - size - 4)),
    };
  }, []);

  // Pointer handlers for drag
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, bx: pos.x, by: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
    const newPos = clamp(dragStartRef.current.bx + dx, dragStartRef.current.by + dy);
    setPos(newPos);
  }, [clamp]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    storePosition(userKey, pos);
    // If it was a tap (not drag), toggle after short delay
    if (!hasDraggedRef.current) {
      setTimeout(() => toggleAll(), 0);
    }
  }, [userKey, pos, toggleAll]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={btnRef}
          variant="outline"
          size="icon"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={`fixed z-40 h-9 w-9 rounded-full shadow-lg border-border/60 bg-card/90 backdrop-blur-sm hover:bg-muted touch-none select-none transition-all duration-500 ${
            visible ? "opacity-100 scale-100" : "opacity-0 scale-50"
          }`}
          style={{ left: pos.x, top: pos.y }}
          aria-label={allCollapsed ? "Expandir todos os cards" : "Recolher todos os cards"}
        >
          {allCollapsed ? (
            <ChevronsUpDown className="h-4 w-4 text-foreground" />
          ) : (
            <ChevronsDownUp className="h-4 w-4 text-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {allCollapsed ? "Expandir todos os cards" : "Recolher todos os cards"}
      </TooltipContent>
    </Tooltip>
  );
}
