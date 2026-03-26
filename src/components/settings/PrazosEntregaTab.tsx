/**
 * Delivery Deadlines Settings Tab — Admin configures delivery deadline options
 * that appear in the CloseSaleModal.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";

interface DeliveryDeadline {
  id: string;
  label: string;
  dias: number;
}

export function PrazosEntregaTab() {
  const [deadlines, setDeadlines] = useState<DeliveryDeadline[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newDias, setNewDias] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeadlines();
  }, []);

  const loadDeadlines = async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    const { data } = await supabase
      .from("tenant_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("chave", "prazos_entrega")
      .maybeSingle();

    if (data && (data as any).valor) {
      try {
        setDeadlines(JSON.parse((data as any).valor));
      } catch {
        setDeadlines([]);
      }
    } else {
      // Default deadlines
      setDeadlines([
        { id: "1", label: "30 dias úteis", dias: 30 },
        { id: "2", label: "45 dias úteis", dias: 45 },
        { id: "3", label: "60 dias úteis", dias: 60 },
        { id: "4", label: "90 dias úteis", dias: 90 },
      ]);
    }
    setLoading(false);
  };

  const saveDeadlines = async (updated: DeliveryDeadline[]) => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    const payload = {
      tenant_id: tenantId,
      chave: "prazos_entrega",
      valor: JSON.stringify(updated),
    };

    const { error } = await supabase
      .from("tenant_settings" as any)
      .upsert(payload as any, { onConflict: "tenant_id,chave" });

    if (error) {
      console.error("Upsert error, trying delete+insert:", error);
      // Fallback: delete then insert
      await supabase
        .from("tenant_settings" as any)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("chave", "prazos_entrega");

      const { error: insertError } = await supabase
        .from("tenant_settings" as any)
        .insert(payload as any);

      if (insertError) {
        console.error("Insert error:", insertError);
        toast.error("Erro ao salvar prazos. Verifique se a tabela tenant_settings existe.");
        return;
      }
    }

    toast.success("Prazos salvos!");
  };

  const addDeadline = () => {
    if (!newLabel.trim() || !newDias) return;
    const updated = [...deadlines, { id: crypto.randomUUID(), label: newLabel.trim(), dias: Number(newDias) }];
    setDeadlines(updated);
    saveDeadlines(updated);
    setNewLabel("");
    setNewDias("");
  };

  const removeDeadline = (id: string) => {
    const updated = deadlines.filter(d => d.id !== id);
    setDeadlines(updated);
    saveDeadlines(updated);
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Prazos de Entrega
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure os prazos de entrega disponíveis no modal de fechamento de venda.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Descrição do Prazo</Label>
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex: 45 dias úteis"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div className="w-24">
              <Label className="text-xs">Dias</Label>
              <Input
                type="number"
                min={1}
                value={newDias}
                onChange={e => setNewDias(e.target.value)}
                placeholder="45"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <Button size="sm" className="gap-1.5 h-9" onClick={addDeadline} disabled={!newLabel.trim() || !newDias}>
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {deadlines.map(d => (
              <div key={d.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{d.label}</span>
                  <Badge variant="outline" className="text-[10px]">{d.dias} dias</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeDeadline(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {deadlines.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum prazo cadastrado</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
