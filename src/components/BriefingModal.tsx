/**
 * BriefingModal — Complete structured briefing for clients.
 * Uses structured form with auto-save debounce and print support.
 * Data stored as JSONB in client_briefings.responses.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { FileText, Save, Edit2, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { BriefingStructuredForm } from "@/components/briefing/BriefingStructuredForm";
import { BriefingPrintButton } from "@/components/briefing/BriefingPrintButton";

interface BriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  orcamentoNumero?: string;
  onSendToSimulator?: (data: { environments: string[]; descricaoAmbientes: string; quantidadeAmbientes: number; budgetExpectation: string }) => void;
}

export function BriefingModal({ open, onOpenChange, clientId, clientName, orcamentoNumero, onSendToSimulator }: BriefingModalProps) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responsesRef = useRef<Record<string, any>>({});

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    const { data: existing } = await supabase
      .from("client_briefings" as any)
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (existing) {
      setExistingId((existing as any).id);
      const r = (existing as any).responses || {};
      setResponses(r);
      responsesRef.current = r;
      setReadOnly(true);
    } else {
      const initial = { client_1_name: clientName };
      setResponses(initial);
      responsesRef.current = initial;
      setExistingId(null);
      setReadOnly(false);
    }
    setLoading(false);
  }, [clientId, clientName]);

  useEffect(() => {
    if (open) fetchBriefing();
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [open, fetchBriefing]);

  // Auto-save with debounce (3 seconds after last change)
  const triggerAutoSave = useCallback(async (currentResponses: Record<string, any>, currentExistingId: string | null) => {
    if (!currentExistingId) return; // Only auto-save if already saved once
    setAutoSaving(true);
    try {
      const tenantId = await getResolvedTenantId();
      await supabase
        .from("client_briefings" as any)
        .update({
          responses: currentResponses,
          updated_at: new Date().toISOString(),
          tenant_id: tenantId,
        } as any)
        .eq("id", currentExistingId);
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      setAutoSaving(false);
    }
  }, []);

  const updateResponse = useCallback((key: string, value: any) => {
    setResponses(prev => {
      const updated = { ...prev, [key]: value };
      responsesRef.current = updated;

      // Schedule auto-save
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        triggerAutoSave(responsesRef.current, existingId);
      }, 3000);

      return updated;
    });
  }, [existingId, triggerAutoSave]);

  const toggleCheckbox = useCallback((key: string, option: string) => {
    setResponses(prev => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const updated = current.includes(option)
        ? current.filter((o: string) => o !== option)
        : [...current, option];
      const newResponses = { ...prev, [key]: updated };
      responsesRef.current = newResponses;

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        triggerAutoSave(responsesRef.current, existingId);
      }, 3000);

      return newResponses;
    });
  }, [existingId, triggerAutoSave]);

  const handleSave = useCallback(async () => {
    // Cancel any pending auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    const required = ["seller_name", "client_1_name", "client_1_phone", "construction_stage", "purchase_timeline"];
    const missing = required.filter(k => !responses[k]);
    if (missing.length > 0) {
      toast.error("Preencha os campos obrigatórios marcados com *");
      return;
    }

    setSaving(true);
    const tenantId = await getResolvedTenantId();

    const payload = {
      client_id: clientId,
      client_name: clientName,
      orcamento_numero: orcamentoNumero || null,
      tenant_id: tenantId,
      responses,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      const { error } = await supabase
        .from("client_briefings" as any)
        .update(payload as any)
        .eq("id", existingId);
      if (error) {
        console.error(error);
        toast.error("Erro ao atualizar briefing");
      } else {
        toast.success("Briefing atualizado!");
        setReadOnly(true);
      }
    } else {
      const { data, error } = await supabase
        .from("client_briefings" as any)
        .insert(payload as any)
        .select("id")
        .single();
      if (error) {
        console.error(error);
        toast.error("Erro ao salvar briefing");
      } else {
        setExistingId((data as any).id);
        toast.success("Briefing salvo com sucesso!");
        setReadOnly(true);
      }
    }
    setSaving(false);
  }, [responses, clientId, clientName, orcamentoNumero, existingId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden !grid-rows-none" style={{ display: "flex" }}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Briefing — {clientName}
              {autoSaving && (
                <span className="text-xs text-muted-foreground animate-pulse ml-2">Salvando...</span>
              )}
            </DialogTitle>
            {existingId && Object.keys(responses).length > 0 && (
              <BriefingPrintButton clientName={clientName} orcamentoNumero={orcamentoNumero} responses={responses} />
            )}
          </div>
          {orcamentoNumero && (
            <p className="text-xs text-muted-foreground">Orçamento: {orcamentoNumero}</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1" style={{ maxHeight: "calc(90vh - 180px)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {readOnly && (
                <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
                  <span className="text-sm text-muted-foreground">Briefing preenchido — modo visualização</span>
                  <Button variant="outline" size="sm" onClick={() => setReadOnly(false)} className="gap-1">
                    <Edit2 className="h-3 w-3" /> Editar
                  </Button>
                </div>
              )}
              <BriefingStructuredForm
                responses={responses}
                onChange={updateResponse}
                onToggleCheckbox={toggleCheckbox}
                readOnly={readOnly}
              />
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {onSendToSimulator && existingId && (
            <Button
              variant="secondary"
              className="gap-1.5"
              onClick={() => {
                const envs: string[] = Array.isArray(responses.environments) ? responses.environments : [];
                const otherEnv = responses.environments_other ? String(responses.environments_other).trim() : "";
                const allEnvs = otherEnv ? [...envs, otherEnv] : envs;
                onSendToSimulator({
                  environments: allEnvs,
                  descricaoAmbientes: allEnvs.join(", "),
                  quantidadeAmbientes: allEnvs.length,
                  budgetExpectation: responses.budget_expectation || "",
                });
                onOpenChange(false);
                toast.success("Dados do briefing enviados para o simulador!");
              }}
            >
              <ArrowRight className="h-4 w-4" />
              Enviar para Simulador
            </Button>
          )}
          {!readOnly && (
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : existingId ? "Atualizar Briefing" : "Salvar Briefing"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
