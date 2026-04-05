import { useState, useEffect, useRef, useCallback } from "react";

interface VariableOption {
  var: string;
  desc: string;
}

interface Props {
  variables: VariableOption[];
  editorRef: React.RefObject<HTMLDivElement>;
}

/**
 * Autocomplete dropdown for contract template variables.
 * Listens for `{{` typed in a contentEditable editor and shows matching suggestions.
 */
export function VariableAutocomplete({ variables, editorRef }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? variables.filter(
        (v) =>
          v.var.toLowerCase().includes(query.toLowerCase()) ||
          v.desc.toLowerCase().includes(query.toLowerCase()),
      )
    : variables;

  const insertVariable = useCallback(
    (varName: string) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current) return;

      const range = sel.getRangeAt(0);
      if (!editorRef.current.contains(range.commonAncestorContainer)) return;

      // Find and delete the typed `{{query` before the cursor
      const textNode = range.startContainer;
      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent || "";
        const cursorPos = range.startOffset;
        // Look backwards for `{{`
        const before = text.substring(0, cursorPos);
        const braceIdx = before.lastIndexOf("{{");
        if (braceIdx >= 0) {
          // Replace from `{{` to cursor with the full variable
          const newText = text.substring(0, braceIdx) + varName + text.substring(cursorPos);
          textNode.textContent = newText;
          // Position cursor after the inserted variable
          const newPos = braceIdx + varName.length;
          range.setStart(textNode, newPos);
          range.setEnd(textNode, newPos);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      setOpen(false);
      setQuery("");
    },
    [editorRef],
  );

  // Listen to input events on the editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleInput = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) {
        setOpen(false);
        return;
      }

      const text = textNode.textContent || "";
      const cursorPos = range.startOffset;
      const before = text.substring(0, cursorPos);
      const braceIdx = before.lastIndexOf("{{");

      if (braceIdx >= 0) {
        // Check there's no `}}` between `{{` and cursor
        const between = before.substring(braceIdx);
        if (!between.includes("}}")) {
          const partial = before.substring(braceIdx + 2); // text after `{{`
          setQuery(partial);
          setSelectedIdx(0);

          // Calculate dropdown position from cursor
          const rect = range.getBoundingClientRect();
          const editorRect = editor.getBoundingClientRect();
          setPosition({
            top: rect.bottom - editorRect.top + editor.scrollTop + 4,
            left: rect.left - editorRect.left,
          });
          setOpen(true);
          return;
        }
      }

      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered.length > 0) {
          e.preventDefault();
          insertVariable(filtered[selectedIdx]?.var || filtered[0].var);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };

    editor.addEventListener("input", handleInput);
    editor.addEventListener("keydown", handleKeyDown);
    return () => {
      editor.removeEventListener("input", handleInput);
      editor.removeEventListener("keydown", handleKeyDown);
    };
  }, [editorRef, open, filtered, selectedIdx, insertVariable]);

  // Scroll selected item into view
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const item = dropdownRef.current.children[selectedIdx] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, open]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 max-h-48 w-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.slice(0, 20).map((v, idx) => (
        <button
          key={v.var}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent editor blur
            insertVariable(v.var);
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
            idx === selectedIdx
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <span className="font-mono font-medium shrink-0">{v.var}</span>
          <span className="truncate text-muted-foreground">{v.desc}</span>
        </button>
      ))}
    </div>
  );
}
