import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles, Copy, BookOpen, Loader2, ChevronLeft, ChevronRight, Wand2, Trash2, Pencil, Save, User,
} from "lucide-react";
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

const DISC_META: Record<string, { label: string; emoji: string; color: string }> = {
  D: { label: "Dominante", emoji: "🔴", color: "bg-red-500/15 text-red-700 border-red-500/30" },
  I: { label: "Influente", emoji: "🟡", color: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
  S: { label: "Estável", emoji: "🟢", color: "bg-green-500/15 text-green-700 border-green-500/30" },
  C: { label: "Conforme", emoji: "🔵", color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
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
  disc_profile?: string | null;
  created_at: string;
}

interface CopyItem {
  id: string;
  tipo: string;
  label: string;
  mensagem: string;
  is_ai: boolean;
  disc_profile?: string | null;
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
  const [activeDisc, setActiveDisc] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [savedCopies, setSavedCopies] = useState<SavedCopy[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedDiscGen, setSelectedDiscGen] = useState<string>("");

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [pendingCopies, setPendingCopies] = useState<Array<{ tipo: string; label: string; mensagem: string; disc_profile?: string | null }>>([]);
  const [editingIndex, setEditingIndex] = useState(0);
  const [editLabel, setEditLabel] = useState("");
  const [editMensagem, setEditMensagem] = useState("");
  const [saving, setSaving] = useState(false);

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

  const allCopies: CopyItem[] = [
    ...readyCopies.map((c, i) => ({ id: `ready-${i}`, tipo: c.tipo, label: c.label, mensagem: c.mensagem, is_ai: false, disc_profile: null })),
    ...savedCopies.map((c) => ({ id: c.id, tipo: c.tipo, label: c.label, mensagem: c.mensagem, is_ai: c.is_ai, disc_profile: c.disc_profile })),
  ];

  const types = Array.from(new Set(allCopies.map((c) => c.tipo)));
  const discProfiles = Array.from(new Set(allCopies.map((c) => c.disc_profile).filter(Boolean))) as string[];

  const filtered = allCopies.filter((c) => {
    if (activeType !== "all" && c.tipo !== activeType) return false;
    if (activeDisc !== "all" && (c.disc_profile || "") !== activeDisc) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [activeType, activeDisc]);

  const handleGenerateAI = useCallback(async () => {
    if (!tenantId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          action: "generate_copys",
          tenant_id: tenantId,
          count: 4,
          disc_profile: selectedDiscGen || undefined,
        },
      });

      if (error) throw error;

      const newCopies = (data?.copys || []) as Array<{ tipo: string; label: string; mensagem: string; disc_profile?: string }>;

      if (newCopies.length === 0) {
        toast.info("Nenhuma nova copy gerada. Tente novamente.");
        setGenerating(false);
        return;
      }

      // Open edit modal for review before saving
      setPendingCopies(newCopies);
      setEditingIndex(0);
      setEditLabel(newCopies[0].label);
      setEditMensagem(newCopies[0].mensagem);
      setEditOpen(true);
    } catch (err: any) {
      console.error("AI copy generation error:", err);
      toast.error("Erro ao gerar copys com IA");
    }
    setGenerating(false);
  }, [tenantId, selectedDiscGen]);

  const handleEditNav = (index: number) => {
    // Save current edits to pending
    setPendingCopies((prev) => prev.map((c, i) => i === editingIndex ? { ...c, label: editLabel, mensagem: editMensagem } : c));
    setEditingIndex(index);
    setEditLabel(pendingCopies[index].label);
    setEditMensagem(pendingCopies[index].mensagem);
  };

  const handleRemovePending = (index: number) => {
    const updated = pendingCopies.filter((_, i) => i !== index);
    setPendingCopies(updated);
    if (updated.length === 0) { setEditOpen(false); return; }
    const newIdx = Math.min(index, updated.length - 1);
    setEditingIndex(newIdx);
    setEditLabel(updated[newIdx].label);
    setEditMensagem(updated[newIdx].mensagem);
  };

  const handleSaveAll = async () => {
    if (!tenantId) return;
    setSaving(true);
    // Apply current edit
    const final = pendingCopies.map((c, i) => i === editingIndex ? { ...c, label: editLabel, mensagem: editMensagem } : c);

    const rows = final.map((c) => ({
      tenant_id: tenantId,
      tipo: c.tipo || "ia_gerada",
      label: c.label || "Copy IA",
      mensagem: c.mensagem,
      is_ai: true,
      disc_profile: c.disc_profile || null,
    }));

    const { data: inserted } = await (supabase as any).from("vendazap_copys").insert(rows).select("*");
    if (inserted) {
      setSavedCopies((prev) => [...inserted, ...prev]);
      toast.success(`${inserted.length} copys salvas! 🚀`);
    }
    setSaving(false);
    setEditOpen(false);
    setPendingCopies([]);
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith("ready-")) return;
    await (supabase as any).from("vendazap_copys").delete().eq("id", id);
    setSavedCopies((prev) => prev.filter((c) => c.id !== id));
    toast.success("Copy removida");
  };

  const handleEditSaved = async (copy: CopyItem) => {
    if (copy.id.startsWith("ready-")) return;
    setPendingCopies([{ tipo: copy.tipo, label: copy.label, mensagem: copy.mensagem, disc_profile: copy.disc_profile }]);
    setEditingIndex(0);
    setEditLabel(copy.label);
    setEditMensagem(copy.mensagem);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!tenantId) return;
    setSaving(true);
    const copy = pendingCopies[0];
    // If editing an existing saved copy, update it
    const existingId = savedCopies.find((c) => c.label === copy.label && c.tipo === copy.tipo)?.id;
    if (existingId) {
      await (supabase as any).from("vendazap_copys").update({ label: editLabel, mensagem: editMensagem }).eq("id", existingId);
      setSavedCopies((prev) => prev.map((c) => c.id === existingId ? { ...c, label: editLabel, mensagem: editMensagem } : c));
      toast.success("Copy atualizada!");
    } else {
      // New single copy
      const { data: inserted } = await (supabase as any).from("vendazap_copys").insert({
        tenant_id: tenantId,
        tipo: copy.tipo || "ia_gerada",
        label: editLabel,
        mensagem: editMensagem,
        is_ai: true,
        disc_profile: copy.disc_profile || null,
      }).select("*");
      if (inserted?.[0]) {
        setSavedCopies((prev) => [inserted[0], ...prev]);
        toast.success("Copy salva!");
      }
    }
    setSaving(false);
    setEditOpen(false);
    setPendingCopies([]);
  };

  const getTypeStyle = (tipo: string) => COPY_TYPE_LABELS[tipo] || { label: tipo, color: "bg-muted text-muted-foreground border-border" };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Copys Prontas
              <Badge variant="outline" className="text-[10px]">{allCopies.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* DISC profile selector for generation */}
              <div className="flex gap-1">
                {Object.entries(DISC_META).map(([key, meta]) => (
                  <Button
                    key={key}
                    variant={selectedDiscGen === key ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    title={`Gerar para ${meta.label}`}
                    onClick={() => setSelectedDiscGen(selectedDiscGen === key ? "" : key)}
                  >
                    {meta.emoji}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs h-7"
                onClick={handleGenerateAI}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                {selectedDiscGen ? `Gerar ${DISC_META[selectedDiscGen]?.label}` : "Gerar com IA"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* DISC filter */}
          {discProfiles.length > 0 && (
            <ScrollArea className="w-full">
              <div className="flex gap-1.5 pb-1">
                <Badge
                  variant={activeDisc === "all" ? "default" : "outline"}
                  className="cursor-pointer text-[10px] h-6 px-2 shrink-0 hover:opacity-80 transition-opacity"
                  onClick={() => setActiveDisc("all")}
                >
                  <User className="h-3 w-3 mr-1" /> Todos DISC
                </Badge>
                {(["D", "I", "S", "C"] as const).filter((d) => discProfiles.includes(d)).map((d) => {
                  const meta = DISC_META[d];
                  const count = allCopies.filter((c) => c.disc_profile === d).length;
                  return (
                    <Badge
                      key={d}
                      variant="outline"
                      className={`cursor-pointer text-[10px] h-6 px-2 shrink-0 hover:opacity-80 transition-opacity ${activeDisc === d ? meta.color : ""}`}
                      onClick={() => setActiveDisc(d)}
                    >
                      {meta.emoji} {meta.label} ({count})
                    </Badge>
                  );
                })}
              </div>
            </ScrollArea>
          )}

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
                    className={`cursor-pointer text-[10px] h-6 px-2 shrink-0 hover:opacity-80 transition-opacity ${activeType === tipo ? style.color : ""}`}
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
              const disc = copy.disc_profile ? DISC_META[copy.disc_profile] : null;
              return (
                <div key={copy.id} className="border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${style.color}`}>{copy.label}</Badge>
                    {copy.is_ai && (
                      <Badge variant="outline" className="text-[8px] h-4 px-1 border-primary/30 text-primary gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />IA
                      </Badge>
                    )}
                    {disc && (
                      <Badge variant="outline" className={`text-[8px] h-4 px-1 ${disc.color}`}>
                        {disc.emoji} {disc.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{copy.mensagem}</p>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { onCopy(copy.mensagem.replace(/\[NOME\]/g, "Cliente")); toast.success("Copy copiada!"); }}>
                      <Copy className="h-3 w-3" />Copiar
                    </Button>
                    {!copy.id.startsWith("ready-") && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleEditSaved(copy)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleDelete(copy.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
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

      {/* Edit / Review Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4 text-primary" />
              {pendingCopies.length > 1 ? `Revisar Copys (${editingIndex + 1}/${pendingCopies.length})` : "Editar Copy"}
            </DialogTitle>
            <DialogDescription>Revise e edite antes de salvar.</DialogDescription>
          </DialogHeader>

          {pendingCopies.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {pendingCopies.map((c, i) => (
                <Badge
                  key={i}
                  variant={i === editingIndex ? "default" : "outline"}
                  className="cursor-pointer text-[10px] h-6 px-2"
                  onClick={() => handleEditNav(i)}
                >
                  {i + 1}. {c.label?.slice(0, 15)}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={editMensagem}
                onChange={(e) => setEditMensagem(e.target.value)}
                className="mt-1 min-h-[120px]"
              />
              <span className="text-[10px] text-muted-foreground">{editMensagem.length}/500 caracteres</span>
            </div>
            {pendingCopies[editingIndex]?.disc_profile && (
              <Badge variant="outline" className={DISC_META[pendingCopies[editingIndex].disc_profile!]?.color || ""}>
                {DISC_META[pendingCopies[editingIndex].disc_profile!]?.emoji} {DISC_META[pendingCopies[editingIndex].disc_profile!]?.label}
              </Badge>
            )}
          </div>

          <DialogFooter className="gap-2">
            {pendingCopies.length > 1 && (
              <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => handleRemovePending(editingIndex)}>
                <Trash2 className="h-3 w-3 mr-1" /> Remover esta
              </Button>
            )}
            <Button onClick={pendingCopies.length > 1 ? handleSaveAll : handleSaveEdit} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {pendingCopies.length > 1 ? `Salvar todas (${pendingCopies.length})` : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
