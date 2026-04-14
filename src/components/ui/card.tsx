import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CARD_VISIBILITY_STORAGE_PREFIX = "card-visibility";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  cardId?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  persistCollapse?: boolean;
}

interface CardContextValue {
  cardId?: string;
  collapsible: boolean;
  collapsed: boolean;
  title: string;
  storageKey: string | null;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  toggleCollapsed: () => void;
}

const CardContext = React.createContext<CardContextValue | null>(null);

function extractTextContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return node.map(extractTextContent).filter(Boolean).join(" ").trim();
  if (React.isValidElement(node)) return extractTextContent(node.props.children);
  return "";
}

function normalizeCardKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_:/]/g, "");
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  className,
  cardId,
  collapsible = true,
  defaultCollapsed = false,
  persistCollapse = true,
  ...props
}, ref) => {
  const { user } = useAuth();
  const [title, setTitle] = React.useState("");

  const pathname = React.useMemo(() => {
    if (typeof window === "undefined") return "global";
    return window.location.pathname || "global";
  }, []);

  const persistedUserId = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem("current_user_id");
    } catch {
      return null;
    }
  }, []);

  const cardKeyBase = React.useMemo(() => {
    const source = cardId || title;
    return source ? normalizeCardKey(source) : null;
  }, [cardId, title]);

  const storageKey = React.useMemo(() => {
    if (!persistCollapse || !collapsible || !cardKeyBase) return null;

    const userKey = normalizeCardKey(user?.id || persistedUserId || "anon");
    const routeKey = normalizeCardKey(pathname);
    return `${CARD_VISIBILITY_STORAGE_PREFIX}:${userKey}:${routeKey}:${cardKeyBase}`;
  }, [cardKeyBase, collapsible, pathname, persistCollapse, persistedUserId, user?.id]);

  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    if (!storageKey) {
      setCollapsed(defaultCollapsed);
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      setCollapsed(stored === null ? defaultCollapsed : stored === "1");
    } catch {
      setCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed, storageKey]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          // ignore storage failures
        }
      }
      return next;
    });
  }, [storageKey]);

  return (
    <CardContext.Provider value={{ cardId, collapsible, collapsed, title, storageKey, setTitle, toggleCollapsed }}>
      <div
        ref={ref}
        data-card-collapsed={collapsed ? "true" : "false"}
        className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
        {...props}
      />
    </CardContext.Provider>
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const cardContext = React.useContext(CardContext);
    const showToggle = Boolean(cardContext?.collapsible && cardContext.storageKey);

    return (
      <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}>
        {children}
        {showToggle && (
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cardContext.toggleCollapsed}
              aria-expanded={!cardContext.collapsed}
              aria-label={cardContext.collapsed ? "Visualizar informações do card" : "Ocultar informações do card"}
              title={cardContext.collapsed ? "Visualizar informações" : "Ocultar informações"}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              {cardContext.collapsed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              <span className="sr-only">{cardContext.collapsed ? "Visualizar informações" : "Ocultar informações"}</span>
            </Button>
          </div>
        )}
      </div>
    );
  },
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => {
    const cardContext = React.useContext(CardContext);
    const titleText = React.useMemo(() => extractTextContent(children), [children]);

    React.useEffect(() => {
      if (!cardContext) return;
      cardContext.setTitle(titleText);
    }, [cardContext, titleText]);

    return (
      <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props}>
        {children}
      </h3>
    );
  },
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, hidden, ...props }, ref) => {
    const cardContext = React.useContext(CardContext);
    const shouldHide = hidden || Boolean(cardContext?.collapsible && cardContext.collapsed);

    return <div ref={ref} hidden={shouldHide} className={cn("p-6 pt-0", className)} {...props} />;
  },
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, hidden, ...props }, ref) => {
    const cardContext = React.useContext(CardContext);
    const shouldHide = hidden || Boolean(cardContext?.collapsible && cardContext.collapsed);

    return <div ref={ref} hidden={shouldHide} className={cn("flex items-center p-6 pt-0", className)} {...props} />;
  },
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
