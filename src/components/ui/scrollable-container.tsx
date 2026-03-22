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

  // Touch swipe state
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

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

  // Touch swipe handlers
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const threshold = 40;

    const isHoriz = direction === "horizontal" || direction === "both";
    const isVert = direction === "vertical" || direction === "both";

    if (isHoriz && absDx > absDy && absDx > threshold) {
      scroll(dx > 0 ? "left" : "right");
    } else if (isVert && absDy > absDx && absDy > threshold) {
      scroll(dy > 0 ? "up" : "down");
    }
    touchStart.current = null;
  }, [direction]);

  const isHoriz = direction === "horizontal" || direction === "both";
  const isVert = direction === "vertical" || direction === "both";

  const btnBase = cn(
    "absolute z-10 flex items-center justify-center transition-all duration-200",
    "bg-primary/90 text-primary-foreground hover:bg-primary shadow-md hover:shadow-lg",
    "active:scale-95",
    arrowSize === "sm" ? "h-7 w-7 rounded-full" : "h-9 w-9 rounded-full",
  );
  const iconSize = arrowSize === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className={cn("relative group/scroll", className)}>
      {/* Horizontal arrows */}
      {isHoriz && canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className={cn(btnBase, "left-1 top-1/2 -translate-y-1/2")}
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className={iconSize} />
        </button>
      )}
      {isHoriz && canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className={cn(btnBase, "right-1 top-1/2 -translate-y-1/2")}
          aria-label="Rolar para direita"
        >
          <ChevronRight className={iconSize} />
        </button>
      )}

      {/* Vertical arrows */}
      {isVert && canScrollUp && (
        <button
          onClick={() => scroll("up")}
          className={cn(btnBase, "top-1 left-1/2 -translate-x-1/2")}
          aria-label="Rolar para cima"
        >
          <ChevronUp className={iconSize} />
        </button>
      )}
      {isVert && canScrollDown && (
        <button
          onClick={() => scroll("down")}
          className={cn(btnBase, "bottom-1 left-1/2 -translate-x-1/2")}
          aria-label="Rolar para baixo"
        >
          <ChevronDown className={iconSize} />
        </button>
      )}

      {/* Gradient fade hints */}
      {isHoriz && canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background/80 to-transparent z-[5] pointer-events-none" />
      )}
      {isHoriz && canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background/80 to-transparent z-[5] pointer-events-none" />
      )}

      <div
        ref={scrollRef}
        className={cn(
          "w-full",
          isHoriz && "overflow-x-auto",
          isVert && "overflow-y-auto",
        )}
        style={{ maxHeight }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
