import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, GripVertical, Edit2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface BriefingField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio";
  options?: string[]; // for select/radio/checkbox
  required: boolean;
  order: number;
  category: string;
}

export interface BriefingConfig {
  id?: string;
  fields: BriefingField[];
  tenant_id?: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "select", label: "Lista de seleção" },
  { value: "checkbox", label: "Múltipla escolha" },
  { value: "radio", label: "Escolha única" },
];

const CATEGORIES = [
  "Imóvel",
  "Investimento",
  "Preferências",
  "Ambientes",
  "Prazo",
  "Outros",
];

const DEFAULT_FIELDS: BriefingField[] = [
  { id: "1", label: "Tipo de Imóvel", type: "select", options: ["Apartamento", "Casa", "Comercial", "Escritório", "Outro"], required: true, order: 1, category: "Imóvel" },
  { id: "2", label: "Condição do Imóvel", type: "select", options: ["Novo / Na Planta", "Em Reforma", "Pronto / Existente"], required: true, order: 2, category: "Imóvel" },
  { id: "3", label: "Objetivo do Imóvel", type: "select", options: ["Moradia própria", "Investimento", "Locação", "Comercial"], required: false, order: 3, category: "Imóvel" },
  { id: "4", label: "Pretensão de investimento em móveis planejados", type: "select", options: ["Até R$ 20.000", "R$ 20.000 a R$ 50.000", "R$ 50.000 a R$ 100.000", "R$ 100.000 a R$ 200.000", "Acima de R$ 200.000", "Não sei informar"], required: true, order: 4, category: "Investimento" },
  { id: "5", label: "Prazo desejado para entrega", type: "select", options: ["Imediato", "30 dias", "60 dias", "90 dias", "Sem pressa"], required: false, order: 5, category: "Prazo" },
  { id: "6", label: "Quais ambientes deseja mobiliar?", type: "checkbox", options: ["Cozinha", "Sala de estar", "Quarto casal", "Quarto solteiro", "Banheiro", "Lavanderia", "Home office", "Closet", "Varanda", "Área gourmet"], required: true, order: 6, category: "Ambientes" },
  { id: "7", label: "Já possui projeto ou planta?", type: "radio", options: ["Sim, tenho planta", "Sim, tenho projeto 3D", "Não, preciso de projeto", "Não sei"], required: false, order: 7, category: "Outros" },
  { id: "8", label: "Observações adicionais", type: "textarea", required: false, order: 8, category: "Outros" },
];

export function BriefingTab() {
  const [fields, setFields] = useState<BriefingField[]>([]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddField, setShowAddField] = useState(false);
  const [editField, setEditField] = useState<BriefingField | null>(null);
  const [saving, setSaving] = useState(false);

  const [newField, setNewField] = useState<Partial<BriefingField>>({
    label: "", type: "text", options: [], required: false, category: "Outros",
  });
  const [optionsText, setOptionsText] = useState("");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    const { data } = await supabase
      .from("company_settings" as any)
      .select("id, briefing_config")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data) {
      setConfigId((data as any).id);
      const config = (data as any).briefing_config;
      if (config && Array.isArray(config.fields) && config.fields.length > 0) {
        setFields(config.fields);
      } else {
        setFields(DEFAULT_FIELDS);
      }
    } else {
      setFields(DEFAULT_FIELDS);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async (updatedFields: BriefingField[]) => {
    if (!configId) return;
    setSaving(true);
    const { error } = await supabase
      .from("company_settings" as any)
      .update({ briefing_config: { fields: updatedFields } } as any)
      .eq("id", configId);

    if (error) {
      toast.error("Erro ao salvar configuração do briefing");
      console.error(error);
    } else {
      toast.success("Configuração do briefing salva!");
      setFields(updatedFields);
    }
    setSaving(false);
  }, [configId]);

  const handleAddField = useCallback(() => {
    const opts = optionsText.split("\n").map(o => o.trim()).filter(Boolean);
    const field: BriefingField = {
      id: crypto.randomUUID(),
      label: newField.label || "Novo campo",
      type: (newField.type as BriefingField["type"]) || "text",
      options: ["select", "checkbox", "radio"].includes(newField.type || "") ? opts : undefined,
      required: newField.required || false,
      order: fields.length + 1,
      category: newField.category || "Outros",
    };
    const updated = [...fields, field];
    setFields(updated);
    saveConfig(updated);
    setShowAddField(false);
    setNewField({ label: "", type: "text", options: [], required: false, category: "Outros" });
    setOptionsText("");
  }, [newField, optionsText, fields, saveConfig]);

  const handleEditSave = useCallback(() => {
    if (!editField) return;
    const opts = optionsText.split("\n").map(o => o.trim()).filter(Boolean);
    const updated = fields.map(f => f.id === editField.id ? {
      ...editField,
      options: ["select", "checkbox", "radio"].includes(editField.type) ? opts : undefined,
    } : f);
    saveConfig(updated);
    setEditField(null);
    setOptionsText("");
  }, [editField, optionsText, fields, saveConfig]);

  const removeField = useCallback((id: string) => {
    const updated = fields.filter(f => f.id !== id);
    saveConfig(updated);
  }, [fields, saveConfig]);

  const toggleRequired = useCallback((id: string) => {
    const updated = fields.map(f => f.id === id ? { ...f, required: !f.required } : f);
    saveConfig(updated);
  }, [fields, saveConfig]);

  const openEdit = useCallback((field: BriefingField) => {
    setEditField(field);
    setOptionsText((field.options || []).join("\n"));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Configuração do Briefing</CardTitle>
            <Button size="sm" onClick={() => setShowAddField(true)} className="gap-1">
              <Plus className="h-3 w-3" /> Novo Campo
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure as perguntas que serão exibidas no briefing do cliente. Esses campos aparecerão no modal de briefing vinculado ao orçamento.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Pergunta</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-center">Categoria</TableHead>
                  <TableHead className="text-center">Obrigatório</TableHead>
                  <TableHead className="text-center">Opções</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum campo configurado. Clique em "Novo Campo" para começar.
                    </TableCell>
                  </TableRow>
                ) : (
                  fields.map((f, i) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{f.label}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {FIELD_TYPES.find(t => t.value === f.type)?.label || f.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{f.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={f.required} onCheckedChange={() => toggleRequired(f.id)} />
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {f.options ? f.options.length : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeField(f.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {fields.length === 0 && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => { setFields(DEFAULT_FIELDS); saveConfig(DEFAULT_FIELDS); }}>
                Carregar campos padrão
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Field Dialog */}
      <Dialog open={showAddField} onOpenChange={setShowAddField}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Campo do Briefing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pergunta / Rótulo *</Label>
              <Input value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} className="mt-1" placeholder="Ex: Tipo de imóvel" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo do campo</Label>
                <Select value={newField.type} onValueChange={v => setNewField({ ...newField, type: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={newField.category} onValueChange={v => setNewField({ ...newField, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {["select", "checkbox", "radio"].includes(newField.type || "") && (
              <div>
                <Label>Opções (uma por linha)</Label>
                <Textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} className="mt-1" rows={4} placeholder={"Opção 1\nOpção 2\nOpção 3"} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={newField.required} onCheckedChange={v => setNewField({ ...newField, required: v })} />
              <Label>Campo obrigatório</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddField(false)}>Cancelar</Button>
            <Button onClick={handleAddField} disabled={!newField.label?.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Dialog */}
      <Dialog open={!!editField} onOpenChange={v => { if (!v) setEditField(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Campo</DialogTitle></DialogHeader>
          {editField && (
            <div className="space-y-4">
              <div>
                <Label>Pergunta / Rótulo *</Label>
                <Input value={editField.label} onChange={e => setEditField({ ...editField, label: e.target.value })} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo do campo</Label>
                  <Select value={editField.type} onValueChange={v => setEditField({ ...editField, type: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={editField.category} onValueChange={v => setEditField({ ...editField, category: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {["select", "checkbox", "radio"].includes(editField.type) && (
                <div>
                  <Label>Opções (uma por linha)</Label>
                  <Textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} className="mt-1" rows={4} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={editField.required} onCheckedChange={v => setEditField({ ...editField, required: v })} />
                <Label>Campo obrigatório</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditField(null)}>Cancelar</Button>
            <Button onClick={handleEditSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
