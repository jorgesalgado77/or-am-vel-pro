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

const READY_COPIES = [
  { label: "Reativação Firme", tipo: "reativacao", mensagem: "[NOME], seu projeto ficou incrível e as condições especiais que preparei ainda estão válidas — mas por pouco tempo. Seria uma pena perder essa oportunidade! Posso te enviar a proposta atualizada agora? ⏰🔥" },
  { label: "Objeção de Preço", tipo: "objecao", mensagem: "[NOME], entendo a preocupação com o valor. Mas veja: nossos móveis duram mais de 15 anos — isso dá menos de R$ 3 por dia de uso! Além disso, temos condições de pagamento que facilitam muito. Posso montar uma simulação personalizada pra você agora? 💡" },
  { label: "Cliente Indeciso", tipo: "objecao", mensagem: "[NOME], a indecisão é o maior inimigo de um bom negócio. 95% dos nossos clientes dizem que se arrependem de não ter fechado antes! Vamos resolver suas dúvidas agora? Tenho 15 minutos disponíveis pra te mostrar exatamente por que vale a pena. 📞" },
  { label: "Contra Concorrência", tipo: "objecao", mensagem: "[NOME], preço baixo sem qualidade sai caro! Nossos clientes já testaram outras marcas e voltaram. Temos garantia estendida e montagem inclusa. Que tal eu te mostrar um comparativo real? 🏆" },
  { label: "Urgência Máxima", tipo: "urgencia", mensagem: "[NOME], preciso ser direto: essas condições especiais vencem em 48h e os preços dos fornecedores já subiram. Se fecharmos agora, garanto o valor atual + um bônus exclusivo. Posso preparar o contrato? ⚡" },
  { label: "Fechamento Direto", tipo: "fechamento", mensagem: "[NOME], está tudo pronto! Projeto aprovado, condições especiais garantidas e prazo de entrega ideal. Só falta sua confirmação para começarmos. Envio o contrato agora? ✅📋" },
  { label: "Reversão de Desistência", tipo: "reversao", mensagem: "[NOME], antes de desistir, me dá 2 minutos? Tenho uma condição ESPECIAL que ainda não te apresentei. Posso te mostrar? 😉🔑" },
  { label: "Pós-Silêncio", tipo: "reativacao", mensagem: "[NOME], percebi que ficamos sem conversar. Reservei seu projeto com condições diferenciadas, mas preciso de uma posição. Me dá um retorno? 🎯" },
];

interface VendaZapCopy {
  id: string;
  tipo_copy: string;
  tom: string;
  mensagem_gerada: string;
  created_at: string;
}

interface SavedCopy {
  id: string;
  tipo: string;
  label: string;
  mensagem: string;
  is_ai: boolean;
}

const TIPO_LABELS: Record<string, string> = {
  reativacao: "Reativação",
  objecao: "Objeção",
  urgencia: "Urgência",
  fechamento: "Fechamento",
  reversao: "Reversão",
  primeiro_contato: "1º Contato",
  follow_up: "Follow-up",
  apresentacao: "Apresentação",
  pos_venda: "Pós-venda",
  reengajamento: "Reengajamento",
  ia_gerada: "IA Gerada",
};

interface Props {
  replies: QuickReply[];
  onSelect: (mensagem: string) => void;
  onAdd: (titulo: string, mensagem: string) => void;
  onRemove: (id: string) => void;
  loading?: boolean;
  detectedDiscProfile?: string;
}

export function QuickRepliesPopover({ replies, onSelect, onAdd, onRemove, loading, detectedDiscProfile }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newMensagem, setNewMensagem] = useState("");
  const [tab, setTab] = useState("rapidas");
  const [vendaZapCopies, setVendaZapCopies] = useState<VendaZapCopy[]>([]);
  const [loadingCopies, setLoadingCopies] = useState(false);
  const [savedCopies, setSavedCopies] = useState<SavedCopy[]>([]);
  const [copyTypeFilter, setCopyTypeFilter] = useState<string>("all");
  const [discFilter, setDiscFilter] = useState<string>("all");

  // Auto-switch to VendaZap tab and pre-select DISC filter when profile is detected
  useEffect(() => {
    if (detectedDiscProfile && open) {
      setDiscFilter(detectedDiscProfile);
      setTab("vendazap");
    }
  }, [detectedDiscProfile, open]);

  // Fetch VendaZap AI copies when tab switches or popover opens
  useEffect(() => {
    if (!open || tab !== "vendazap") return;
    const tenantId = getTenantId();
    if (!tenantId) return;
    setLoadingCopies(true);
    Promise.all([
      (supabase as any)
        .from("vendazap_messages")
        .select("id, tipo_copy, tom, mensagem_gerada, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30),
      (supabase as any)
        .from("vendazap_copys")
        .select("id, tipo, label, mensagem, is_ai, disc_profile")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
    ]).then(([msgRes, copyRes]: any[]) => {
      setVendaZapCopies(msgRes.data || []);
      setSavedCopies(copyRes.data || []);
      setLoadingCopies(false);
    });
  }, [open, tab]);

  const filtered = replies.filter(
    (r) =>
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.mensagem.toLowerCase().includes(search.toLowerCase())
  );

  // Merge all copy sources: ready + saved + vendazap_messages
  const allVendaZapItems = [
    ...READY_COPIES.map((c, i) => ({ id: `ready-${i}`, tipo: c.tipo, label: c.label, mensagem: c.mensagem, disc_profile: null as string | null })),
    ...savedCopies.map((c) => ({ id: c.id, tipo: c.tipo, label: c.label, mensagem: c.mensagem, disc_profile: (c as any).disc_profile || null })),
    ...vendaZapCopies.map((c) => ({ id: c.id, tipo: c.tipo_copy, label: tipoLabels[c.tipo_copy] || c.tipo_copy, mensagem: c.mensagem_gerada, disc_profile: null as string | null })),
  ];

  const copyTypes = Array.from(new Set(allVendaZapItems.map((c) => c.tipo)));

  const filteredCopies = allVendaZapItems.filter((c) => {
    const matchSearch = !search ||
      c.mensagem.toLowerCase().includes(search.toLowerCase()) ||
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.tipo.toLowerCase().includes(search.toLowerCase());
    const matchType = copyTypeFilter === "all" || c.tipo === copyTypeFilter;
    const matchDisc = discFilter === "all" || c.disc_profile === discFilter || (!c.disc_profile && discFilter === "all");
    return matchSearch && matchType && matchDisc;
  });

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

  const DISC_META: Record<string, { emoji: string; label: string }> = {
    D: { emoji: "🔴", label: "Dominante" },
    I: { emoji: "🟡", label: "Influente" },
    S: { emoji: "🟢", label: "Estável" },
    C: { emoji: "🔵", label: "Conforme" },
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-9 w-9 shrink-0 relative ${detectedDiscProfile ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          title={detectedDiscProfile ? `Respostas rápidas — DISC: ${DISC_META[detectedDiscProfile]?.label || detectedDiscProfile}` : "Respostas rápidas"}
        >
          <Zap className="h-4 w-4" />
          {detectedDiscProfile && DISC_META[detectedDiscProfile] && (
            <span className="absolute -top-0.5 -right-0.5 text-[9px] leading-none">
              {DISC_META[detectedDiscProfile].emoji}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Respostas Rápidas</h4>
              {detectedDiscProfile && DISC_META[detectedDiscProfile] && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
                  {DISC_META[detectedDiscProfile].emoji} {DISC_META[detectedDiscProfile].label}
                </Badge>
              )}
            </div>
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
            <div className="flex flex-col">
              {/* DISC filter chips */}
              <div className="flex gap-1 px-2 py-1 flex-wrap border-b border-border">
                <Badge
                  variant={discFilter === "all" ? "default" : "outline"}
                  className="cursor-pointer text-[8px] h-5 px-1.5"
                  onClick={() => setDiscFilter("all")}
                >
                  Todos DISC
                </Badge>
                {(["D", "I", "S", "C"] as const).map((d) => (
                  <Badge
                    key={d}
                    variant={discFilter === d ? "default" : "outline"}
                    className={`cursor-pointer text-[8px] h-5 px-1.5 gap-0.5 ${discFilter === d && detectedDiscProfile === d ? "ring-1 ring-primary" : ""}`}
                    onClick={() => setDiscFilter(discFilter === d ? "all" : d)}
                  >
                    {DISC_META[d].emoji} {DISC_META[d].label}
                  </Badge>
                ))}
              </div>
              {/* Type filter chips */}
              <div className="flex gap-1 px-2 py-1 flex-wrap border-b border-border">
                <Badge
                  variant={copyTypeFilter === "all" ? "default" : "outline"}
                  className="cursor-pointer text-[8px] h-5 px-1.5"
                  onClick={() => setCopyTypeFilter("all")}
                >
                  Todas
                </Badge>
                {copyTypes.map((tipo) => (
                  <Badge
                    key={tipo}
                    variant={copyTypeFilter === tipo ? "default" : "outline"}
                    className="cursor-pointer text-[8px] h-5 px-1.5"
                    onClick={() => setCopyTypeFilter(tipo)}
                  >
                    {TIPO_LABELS[tipo] || tipo}
                  </Badge>
                ))}
              </div>
              {loadingCopies ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Carregando copys...</p>
              ) : filteredCopies.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">
                  Nenhuma copy encontrada.
                </p>
              ) : (
                <div className="p-1">
                  {filteredCopies.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors"
                      onClick={() => handleSelect(c.mensagem.replace(/\[NOME\]/g, ""))}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-primary/30 text-primary">
                            {c.label}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-3">{c.mensagem}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
