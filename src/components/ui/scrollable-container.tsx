import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollableContainerProps {
  children: React.ReactNode;
  className?: string;
  direction?: "horizontal" | "vertical" | "both";
  maxHeight?: string;
  arrowSize?: "sm" | "md";
}

export function ScrollableContainer({
  children,
  className,
  direction = "horizontal",
  maxHeight,
  arrowSize = "md",
}: ScrollableContainerProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const [canScrollDown, setCanScrollDown] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (direction === "horizontal" || direction === "both") {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    }
    if (direction === "vertical" || direction === "both") {
      setCanScrollUp(el.scrollTop > 2);
      setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 2);
    }
  }, [direction]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scroll = (dir: "left" | "right" | "up" | "down") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 200;
    const map = {
      left: { left: -amount },
      right: { left: amount },
      up: { top: -amount },
      down: { top: amount },
    };
    el.scrollBy({ ...map[dir], behavior: "smooth" });
  };

  const isHoriz = direction === "horizontal" || direction === "both";
  const isVert = direction === "vertical" || direction === "both";
  const btnBase = cn(
    "absolute z-10 flex items-center justify-center bg-card/90 border border-border text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-200 shadow-sm backdrop-blur-sm",
    arrowSize === "sm" ? "h-6 w-6 rounded" : "h-8 w-8 rounded-md",
  );
  const iconSize = arrowSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className={cn("relative group/scroll", className)}>
      {/* Horizontal arrows */}
      {isHoriz && canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className={cn(btnBase, "left-0 top-1/2 -translate-y-1/2")}
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className={iconSize} />
        </button>
      )}
      {isHoriz && canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className={cn(btnBase, "right-0 top-1/2 -translate-y-1/2")}
          aria-label="Rolar para direita"
        >
          <ChevronRight className={iconSize} />
        </button>
      )}

      {/* Vertical arrows */}
      {isVert && canScrollUp && (
        <button
          onClick={() => scroll("up")}
          className={cn(btnBase, "top-0 left-1/2 -translate-x-1/2")}
          aria-label="Rolar para cima"
        >
          <ChevronUp className={iconSize} />
        </button>
      )}
      {isVert && canScrollDown && (
        <button
          onClick={() => scroll("down")}
          className={cn(btnBase, "bottom-0 left-1/2 -translate-x-1/2")}
          aria-label="Rolar para baixo"
        >
          <ChevronDown className={iconSize} />
        </button>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "w-full",
          isHoriz && "overflow-x-auto",
          isVert && "overflow-y-auto",
        )}
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  );
}
