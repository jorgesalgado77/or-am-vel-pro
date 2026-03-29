import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Copy, BookOpen, Loader2, ChevronLeft, ChevronRight, Wand2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

const COPY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  reativacao: { label: "Reativação", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  objecao: { label: "Objeção", color: "bg-red-500/15 text-red-700 border-red-500/30" },
  urgencia: { label: "Urgência", color: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  fechamento: { label: "Fechamento", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  reversao: { label: "Reversão", color: "bg-purple-500/15 text-purple-700 border-purple-500/30" },
  primeiro_contato: { label: "1º Contato", color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  follow_up: { label: "Follow-up", color: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30" },
  apresentacao: { label: "Apresentação", color: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30" },
  pos_venda: { label: "Pós-venda", color: "bg-teal-500/15 text-teal-700 border-teal-500/30" },
  reengajamento: { label: "Reengajamento", color: "bg-pink-500/15 text-pink-700 border-pink-500/30" },
  ia_gerada: { label: "IA Gerada", color: "bg-primary/15 text-primary border-primary/30" },
};

interface ReadyCopy {
  label: string;
  tipo: string;
  mensagem: string;
}

interface SavedCopy {
  id: string;
  tipo: string;
  label: string;
  mensagem: string;
  is_ai: boolean;
  created_at: string;
}

interface Props {
  tenantId: string | null;
  readyCopies: ReadyCopy[];
  onCopy: (text: string) => void;
  addon: any;
}

const PAGE_SIZE = 6;

export function CopysTab({ tenantId, readyCopies, onCopy, addon }: Props) {
  const [activeType, setActiveType] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [savedCopies, setSavedCopies] = useState<SavedCopy[]>([]);
  const [generating, setGenerating] = useState(false);

  // Fetch saved AI-generated copys
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("vendazap_copys")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (data) setSavedCopies(data);
    })();
  }, [tenantId]);

  // Merge ready + saved
  const allCopies: Array<{ id: string; tipo: string; label: string; mensagem: string; is_ai: boolean }> = [
    ...readyCopies.map((c, i) => ({ id: `ready-${i}`, tipo: c.tipo, label: c.label, mensagem: c.mensagem, is_ai: false })),
    ...savedCopies.map((c) => ({ id: c.id, tipo: c.tipo, label: c.label, mensagem: c.mensagem, is_ai: c.is_ai })),
  ];

  const types = Array.from(new Set(allCopies.map((c) => c.tipo)));
  const filtered = activeType === "all" ? allCopies : allCopies.filter((c) => c.tipo === activeType);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [activeType]);

  const handleGenerateAI = useCallback(async () => {
    if (!tenantId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          action: "generate_copys",
          tenant_id: tenantId,
          count: 4,
        },
      });

      if (error) throw error;

      const newCopies = (data?.copys || []) as Array<{ tipo: string; label: string; mensagem: string }>;

      if (newCopies.length === 0) {
        toast.info("Nenhuma nova copy gerada. Tente novamente.");
        setGenerating(false);
        return;
      }

      // Save to DB
      const rows = newCopies.map((c) => ({
        tenant_id: tenantId,
        tipo: c.tipo || "ia_gerada",
        label: c.label || "Copy IA",
        mensagem: c.mensagem,
        is_ai: true,
      }));

      const { data: inserted } = await (supabase as any)
        .from("vendazap_copys")
        .insert(rows)
        .select("*");

      if (inserted) {
        setSavedCopies((prev) => [...inserted, ...prev]);
        toast.success(`${inserted.length} novas copys geradas com IA! 🚀`);
      }
    } catch (err: any) {
      console.error("AI copy generation error:", err);
      toast.error("Erro ao gerar copys com IA");
    }
    setGenerating(false);
  }, [tenantId]);

  const handleDelete = async (id: string) => {
    if (id.startsWith("ready-")) return;
    await (supabase as any).from("vendazap_copys").delete().eq("id", id);
    setSavedCopies((prev) => prev.filter((c) => c.id !== id));
    toast.success("Copy removida");
  };

  const getTypeStyle = (tipo: string) => COPY_TYPE_LABELS[tipo] || { label: tipo, color: "bg-muted text-muted-foreground border-border" };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Copys Prontas
            <Badge variant="outline" className="text-[10px]">{allCopies.length}</Badge>
          </CardTitle>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-7"
            onClick={handleGenerateAI}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            Gerar com IA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Type filter tags */}
        <ScrollArea className="w-full">
          <div className="flex gap-1.5 pb-1">
            <Badge
              variant={activeType === "all" ? "default" : "outline"}
              className="cursor-pointer text-[10px] h-6 px-2 shrink-0 hover:opacity-80 transition-opacity"
              onClick={() => setActiveType("all")}
            >
              Todas ({allCopies.length})
            </Badge>
            {types.map((tipo) => {
              const style = getTypeStyle(tipo);
              const count = allCopies.filter((c) => c.tipo === tipo).length;
              return (
                <Badge
                  key={tipo}
                  variant="outline"
                  className={`cursor-pointer text-[10px] h-6 px-2 shrink-0 hover:opacity-80 transition-opacity ${
                    activeType === tipo ? style.color : ""
                  }`}
                  onClick={() => setActiveType(tipo)}
                >
                  {style.label} ({count})
                </Badge>
              );
            })}
          </div>
        </ScrollArea>

        {/* Copy cards */}
        <div className="grid md:grid-cols-2 gap-3">
          {paginated.map((copy) => {
            const style = getTypeStyle(copy.tipo);
            return (
              <div key={copy.id} className="border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={`text-[10px] ${style.color}`}>{copy.label}</Badge>
                  {copy.is_ai && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1 border-primary/30 text-primary gap-0.5">
                      <Sparkles className="h-2.5 w-2.5" />IA
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{copy.mensagem}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { onCopy(copy.mensagem.replace(/\[NOME\]/g, "Cliente")); toast.success("Copy copiada!"); }}>
                    <Copy className="h-3 w-3" />Copiar
                  </Button>
                  {!copy.id.startsWith("ready-") && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleDelete(copy.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma copy neste filtro.</p>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}