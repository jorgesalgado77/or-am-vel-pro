/**
 * PedagioModal — Modal to input toll values for a client trip.
 */
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, MapPin, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

interface PedagioEntry {
  id?: string;
  descricao: string;
  valor: string;
}

interface PedagioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  trackingId: string;
  onSaved?: () => void;
}

export function PedagioModal({ open, onOpenChange, clientId, clientName, trackingId, onSaved }: PedagioModalProps) {
  const [entries, setEntries] = useState<PedagioEntry[]>([{ descricao: "Pedágio Ida", valor: "" }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing tolls
  useEffect(() => {
    if (!open || !trackingId) return;
    setLoading(true);
    (async () => {
      const tenantId = await getResolvedTenantId();
      if (!tenantId) { setLoading(false); return; }
      const { data } = await (supabase as any)
        .from("client_pedagios")
        .select("*")
        .eq("tracking_id", trackingId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        setEntries(data.map((d: any) => ({
          id: d.id,
          descricao: d.descricao || "",
          valor: d.valor ? (d.valor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
        })));
      } else {
        setEntries([{ descricao: "Pedágio Ida", valor: "" }, { descricao: "Pedágio Volta", valor: "" }]);
      }
      setLoading(false);
    })();
  }, [open, trackingId]);

  const addEntry = () => setEntries(prev => [...prev, { descricao: "", valor: "" }]);

  const removeEntry = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx));

  const updateEntry = (idx: number, field: keyof PedagioEntry, value: string) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: field === "valor" ? maskCurrency(value) : value } : e));
  };

  const totalPedagios = entries.reduce((sum, e) => sum + (unmaskCurrency(e.valor) || 0), 0);

  const handleSave = async () => {
    const tenantId = await getResolvedTenantId();
    if (!tenantId) return;

    setSaving(true);
    try {
      // Delete existing entries for this tracking
      await (supabase as any)
        .from("client_pedagios")
        .delete()
        .eq("tracking_id", trackingId)
        .eq("tenant_id", tenantId);

      // Insert new entries
      const toInsert = entries
        .filter(e => e.descricao.trim() || unmaskCurrency(e.valor) > 0)
        .map(e => ({
          tracking_id: trackingId,
          client_id: clientId,
          tenant_id: tenantId,
          descricao: e.descricao.trim(),
          valor: Math.round(unmaskCurrency(e.valor)),
        }));

      if (toInsert.length > 0) {
        const { error } = await (supabase as any).from("client_pedagios").insert(toInsert);
        if (error) throw error;
      }

      toast.success(`Pedágios salvos para ${clientName}!`);
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar pedágios: " + (err?.message || "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" />
            Informar Pedágios — {clientName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {entries.map((entry, idx) => (
              <div key={idx} className="flex items-end gap-2 p-2 rounded-md border bg-muted/30">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Descrição</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ex: Pedágio Ida"
                    value={entry.descricao}
                    onChange={e => updateEntry(idx, "descricao", e.target.value)}
                  />
                </div>
                <div className="w-28">
                  <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                  <Input
                    className="h-8 text-xs text-right"
                    placeholder="0,00"
                    value={entry.valor}
                    onChange={e => updateEntry(idx, "valor", e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeEntry(idx)}
                  disabled={entries.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={addEntry}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Pedágio
            </Button>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs font-medium text-muted-foreground">Total Pedágios:</span>
              <span className="text-sm font-bold text-foreground">
                {(totalPedagios / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar Pedágios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
