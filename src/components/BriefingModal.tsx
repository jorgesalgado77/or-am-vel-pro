import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Save, Edit2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import type { BriefingField } from "@/components/settings/BriefingTab";

interface BriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  orcamentoNumero?: string;
}

export function BriefingModal({ open, onOpenChange, clientId, clientName, orcamentoNumero }: BriefingModalProps) {
  const [fields, setFields] = useState<BriefingField[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    // Fetch briefing config
    const { data: settings } = await supabase
      .from("company_settings" as any)
      .select("briefing_config")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const config = (settings as any)?.briefing_config;
    if (config && Array.isArray(config.fields)) {
      setFields(config.fields);
    }

    // Check if briefing already exists for this client
    const { data: existing } = await supabase
      .from("client_briefings" as any)
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (existing) {
      setExistingId((existing as any).id);
      setResponses((existing as any).responses || {});
      setReadOnly(true);
    } else {
      setResponses({});
      setReadOnly(false);
    }

    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (open) fetchBriefing();
  }, [open, fetchBriefing]);

  const updateResponse = useCallback((fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  const toggleCheckbox = useCallback((fieldId: string, option: string) => {
    setResponses(prev => {
      const current = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
      const updated = current.includes(option)
        ? current.filter((o: string) => o !== option)
        : [...current, option];
      return { ...prev, [fieldId]: updated };
    });
  }, []);

  const handleSave = useCallback(async () => {
    // Validate required fields
    const missing = fields.filter(f => f.required && !responses[f.id]);
    if (missing.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missing.map(f => f.label).join(", ")}`);
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
  }, [fields, responses, clientId, clientName, orcamentoNumero, existingId]);

  // Group fields by category
  const groupedFields = useMemo(() => {
    const groups: Record<string, BriefingField[]> = {};
    fields.sort((a, b) => a.order - b.order).forEach(f => {
      const cat = f.category || "Outros";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });
    return Object.entries(groups);
  }, [fields]);

  const renderField = (field: BriefingField) => {
    const value = responses[field.id];
    const disabled = readOnly;

    switch (field.type) {
      case "text":
        return <Input value={value || ""} onChange={e => updateResponse(field.id, e.target.value)} disabled={disabled} placeholder="Responda aqui..." />;
      case "textarea":
        return <Textarea value={value || ""} onChange={e => updateResponse(field.id, e.target.value)} disabled={disabled} rows={3} placeholder="Responda aqui..." />;
      case "select":
        return (
          <Select value={value || ""} onValueChange={v => updateResponse(field.id, v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "checkbox":
        return (
          <div className="flex flex-wrap gap-3">
            {(field.options || []).map(opt => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={Array.isArray(value) && value.includes(opt)}
                  onCheckedChange={() => toggleCheckbox(field.id, opt)}
                  disabled={disabled}
                />
                <span className="text-sm">{opt}</span>
              </div>
            ))}
          </div>
        );
      case "radio":
        return (
          <RadioGroup value={value || ""} onValueChange={v => updateResponse(field.id, v)} disabled={disabled}>
            <div className="flex flex-wrap gap-4">
              {(field.options || []).map(opt => (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem value={opt} />
                  <span className="text-sm">{opt}</span>
                </div>
              ))}
            </div>
          </RadioGroup>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Briefing — {clientName}
          </DialogTitle>
          {orcamentoNumero && (
            <p className="text-sm text-muted-foreground">Orçamento: {orcamentoNumero}</p>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum campo configurado no briefing.</p>
              <p className="text-xs mt-1">Configure os campos em Configurações &gt; Briefing.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {readOnly && (
                <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
                  <span className="text-sm text-muted-foreground">Briefing preenchido — modo visualização</span>
                  <Button variant="outline" size="sm" onClick={() => setReadOnly(false)} className="gap-1">
                    <Edit2 className="h-3 w-3" /> Editar
                  </Button>
                </div>
              )}
              {groupedFields.map(([category, catFields]) => (
                <Card key={category}>
                  <CardContent className="pt-4 space-y-4">
                    <Badge variant="secondary" className="mb-2">{category}</Badge>
                    {catFields.map(field => (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-sm font-medium">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        {renderField(field)}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {!readOnly && fields.length > 0 && (
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
