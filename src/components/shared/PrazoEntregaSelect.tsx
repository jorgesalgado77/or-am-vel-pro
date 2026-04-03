/**
 * PrazoEntregaSelect — Reusable delivery deadline selector with "Outro" (custom) option.
 * Custom options are persisted to tenant_settings and can only be removed by admins.
 */
import { useState, useEffect, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";

export interface DeadlineOption {
  id: string;
  label: string;
  dias: number;
  custom?: boolean;
}

const DEFAULT_DEADLINES: DeadlineOption[] = [
  { id: "d15", label: "15 dias úteis", dias: 15 },
  { id: "d30", label: "30 dias úteis", dias: 30 },
  { id: "d45", label: "45 dias úteis", dias: 45 },
  { id: "d60", label: "60 dias úteis", dias: 60 },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  isAdmin?: boolean;
  /** compact mode for table cells */
  compact?: boolean;
  placeholder?: string;
}

export function PrazoEntregaSelect({ value, onChange, isAdmin = false, compact = false, placeholder = "Selecione o prazo..." }: Props) {
  const [deadlines, setDeadlines] = useState<DeadlineOption[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadDeadlines = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) {
      setDeadlines(DEFAULT_DEADLINES);
      setLoaded(true);
      return;
    }
    const { data } = await supabase
      .from("tenant_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("chave", "prazos_entrega")
      .maybeSingle();

    if (data && (data as any).valor) {
      try {
        const parsed = JSON.parse((data as any).valor) as DeadlineOption[];
        // Merge defaults with custom ones, deduplicating by label
        const seen = new Set<string>();
        const merged: DeadlineOption[] = [];
        for (const d of [...DEFAULT_DEADLINES, ...parsed]) {
          const key = d.label.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(d);
          }
        }
        setDeadlines(merged);
      } catch {
        setDeadlines(DEFAULT_DEADLINES);
      }
    } else {
      setDeadlines(DEFAULT_DEADLINES);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { loadDeadlines(); }, [loadDeadlines]);

  const persistDeadlines = async (updated: DeadlineOption[]) => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    const payload = { tenant_id: tenantId, chave: "prazos_entrega", valor: JSON.stringify(updated) };
    const { error } = await supabase
      .from("tenant_settings" as any)
      .upsert(payload as any, { onConflict: "tenant_id,chave" });
    if (error) {
      await supabase.from("tenant_settings" as any).delete().eq("tenant_id", tenantId).eq("chave", "prazos_entrega");
      await supabase.from("tenant_settings" as any).insert(payload as any);
    }
  };

  const handleAddCustom = async () => {
    const trimmed = customValue.trim();
    if (!trimmed) { toast.error("Informe o prazo personalizado"); return; }
    if (deadlines.some(d => d.label.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Esse prazo já existe"); return;
    }
    const newOption: DeadlineOption = {
      id: `custom_${Date.now()}`,
      label: trimmed,
      dias: 0,
      custom: true,
    };
    const updated = [...deadlines, newOption];
    setDeadlines(updated);
    await persistDeadlines(updated);
    onChange(trimmed);
    setCustomValue("");
    setShowCustomInput(false);
    toast.success(`Prazo "${trimmed}" adicionado e salvo`);
  };

  const handleRemoveCustom = async (id: string) => {
    const updated = deadlines.filter(d => d.id !== id);
    setDeadlines(updated);
    await persistDeadlines(updated);
    if (deadlines.find(d => d.id === id)?.label === value) {
      onChange("");
    }
    toast.success("Prazo personalizado removido");
  };

  const handleSelectChange = (v: string) => {
    if (v === "__outro__") {
      setShowCustomInput(true);
      return;
    }
    onChange(v);
  };

  if (!loaded) return null;

  const triggerClass = compact ? "h-8 text-xs" : "mt-1 h-9 text-sm";

  if (showCustomInput) {
    return (
      <div className={`flex gap-1.5 ${compact ? "" : "mt-1"}`}>
        <Input
          value={customValue}
          onChange={e => setCustomValue(e.target.value)}
          placeholder="Ex: 20 dias úteis"
          className={compact ? "h-8 text-xs flex-1" : "h-9 text-sm flex-1"}
          autoFocus
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); handleAddCustom(); }
            if (e.key === "Escape") { setShowCustomInput(false); setCustomValue(""); }
          }}
        />
        <Button type="button" size="icon" variant="default" className={compact ? "h-8 w-8" : "h-9 w-9"} onClick={handleAddCustom}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="outline" className={compact ? "h-8 w-8" : "h-9 w-9"} onClick={() => { setShowCustomInput(false); setCustomValue(""); }}>
          ✕
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={handleSelectChange}>
      <SelectTrigger className={triggerClass}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {deadlines.map(d => (
          <SelectItem key={d.id} value={d.label}>
            <span className="flex items-center gap-2 w-full">
              {d.label}
              {d.custom && isAdmin && (
                <button
                  type="button"
                  className="ml-auto text-destructive hover:text-destructive/80 p-0.5"
                  onClick={e => { e.stopPropagation(); handleRemoveCustom(d.id); }}
                  title="Remover prazo (admin)"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          </SelectItem>
        ))}
        <SelectItem value="__outro__">
          <span className="flex items-center gap-1.5 text-primary">
            <Plus className="h-3 w-3" /> Outro...
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
