import { useRef, useCallback, useEffect } from "react";
import type { PageData } from "./types";

export function useEditorHistory(pages: PageData[], setPages: React.Dispatch<React.SetStateAction<PageData[]>>) {
  const historyRef = useRef<PageData[][]>([]);
  const historyIdxRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const prevPagesRef = useRef<string>("");

  const pushHistory = useCallback((snapshot: PageData[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const h = historyRef.current;
    const idx = historyIdxRef.current;
    historyRef.current = h.slice(0, idx + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(snapshot)));
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
  }, []);

  useEffect(() => {
    if (historyRef.current.length === 0) {
      pushHistory(pages);
    }
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(pages);
    if (serialized !== prevPagesRef.current) {
      prevPagesRef.current = serialized;
      pushHistory(pages);
    }
  }, [pages, pushHistory]);

  const canUndo = historyIdxRef.current > 0;
  const canRedo = historyIdxRef.current < historyRef.current.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snapshot = historyRef.current[historyIdxRef.current];
    skipHistoryRef.current = true;
    prevPagesRef.current = JSON.stringify(snapshot);
    setPages(JSON.parse(JSON.stringify(snapshot)));
  }, [setPages]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snapshot = historyRef.current[historyIdxRef.current];
    skipHistoryRef.current = true;
    prevPagesRef.current = JSON.stringify(snapshot);
    setPages(JSON.parse(JSON.stringify(snapshot)));
  }, [setPages]);

  return { canUndo, canRedo, handleUndo, handleRedo };
}
