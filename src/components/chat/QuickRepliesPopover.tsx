import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Plus, Trash2, Search, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QuickReply } from "@/hooks/useQuickReplies";

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

  const filtered = replies.filter(
    (r) =>
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.mensagem.toLowerCase().includes(search.toLowerCase())
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
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 text-xs pl-7"
              />
            </div>
          )}
        </div>

        <ScrollArea className="max-h-[240px]">
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
