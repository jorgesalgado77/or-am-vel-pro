import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Plus, Trash2, Search, X, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import type { QuickReply } from "@/hooks/useQuickReplies";

interface VendaZapCopy {
  id: string;
  tipo_copy: string;
  tom: string;
  mensagem_gerada: string;
  created_at: string;
}

interface Props {
  replies: QuickReply[];
  onSelect: (mensagem: string) => void;
  onAdd: (titulo: string, mensagem: string) => void;
  onRemove: (id: string) => void;
  loading?: boolean;
}

export function QuickRepliesPopover({ replies, onSelect, onAdd, onRemove, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newMensagem, setNewMensagem] = useState("");
  const [tab, setTab] = useState("rapidas");
  const [vendaZapCopies, setVendaZapCopies] = useState<VendaZapCopy[]>([]);
  const [loadingCopies, setLoadingCopies] = useState(false);

  // Fetch VendaZap AI copies when tab switches or popover opens
  useEffect(() => {
    if (!open || tab !== "vendazap") return;
    const tenantId = getTenantId();
    if (!tenantId) return;
    setLoadingCopies(true);
    (supabase as any)
      .from("vendazap_messages")
      .select("id, tipo_copy, tom, mensagem_gerada, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }: any) => {
        setVendaZapCopies(data || []);
        setLoadingCopies(false);
      });
  }, [open, tab]);

  const filtered = replies.filter(
    (r) =>
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.mensagem.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCopies = vendaZapCopies.filter(
    (c) =>
      c.mensagem_gerada.toLowerCase().includes(search.toLowerCase()) ||
      c.tipo_copy.toLowerCase().includes(search.toLowerCase()) ||
      c.tom.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!newTitulo.trim() || !newMensagem.trim()) return;
    onAdd(newTitulo.trim(), newMensagem.trim());
    setNewTitulo("");
    setNewMensagem("");
    setShowForm(false);
  };

  const handleSelect = (msg: string) => {
    onSelect(msg);
    setOpen(false);
  };

  const tipoLabels: Record<string, string> = {
    primeiro_contato: "1º Contato",
    follow_up: "Follow-up",
    apresentacao: "Apresentação",
    fechamento: "Fechamento",
    pos_venda: "Pós-venda",
    reengajamento: "Reengajamento",
    objecao: "Objeção",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          title="Respostas rápidas"
        >
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-foreground">Respostas Rápidas</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {showForm ? (
            <div className="space-y-2">
              <Input
                placeholder="Título (ex: Saudação)"
                value={newTitulo}
                onChange={(e) => setNewTitulo(e.target.value)}
                className="h-8 text-xs"
              />
              <Textarea
                placeholder="Mensagem..."
                value={newMensagem}
                onChange={(e) => setNewMensagem(e.target.value)}
                className="min-h-[60px] text-xs resize-none"
                rows={2}
              />
              <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd}>
                Salvar
              </Button>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 text-xs pl-7"
                />
              </div>
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="w-full h-7 p-0.5">
                  <TabsTrigger value="rapidas" className="flex-1 text-[10px] h-6 gap-1">
                    <Zap className="h-3 w-3" /> Minhas
                  </TabsTrigger>
                  <TabsTrigger value="vendazap" className="flex-1 text-[10px] h-6 gap-1">
                    <Sparkles className="h-3 w-3" /> VendaZap AI
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
        </div>

        <ScrollArea className="max-h-[240px]">
          {tab === "rapidas" && (
            <>
              {loading ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Carregando...</p>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">
                  {replies.length === 0 ? "Nenhuma resposta rápida. Clique + para criar." : "Nenhum resultado."}
                </p>
              ) : (
                <div className="p-1">
                  {filtered.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors"
                      onClick={() => handleSelect(r.mensagem)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{r.titulo}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{r.mensagem}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "vendazap" && (
            <>
              {loadingCopies ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Carregando copys...</p>
              ) : filteredCopies.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">
                  Nenhuma copy gerada no VendaZap AI ainda.
                </p>
              ) : (
                <div className="p-1">
                  {filteredCopies.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors"
                      onClick={() => handleSelect(c.mensagem_gerada)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-primary/30 text-primary">
                            {tipoLabels[c.tipo_copy] || c.tipo_copy}
                          </Badge>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                            {c.tom}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-3">{c.mensagem_gerada}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
