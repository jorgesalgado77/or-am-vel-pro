import { memo } from "react";

interface Props {
  names: string[];
}

export const TypingIndicator = memo(function TypingIndicator({ names }: Props) {
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} está digitando`
      : `${names.slice(0, 2).join(", ")} estão digitando`;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <div className="flex gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-xs text-muted-foreground italic">{label}...</span>
    </div>
  );
});
