import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Save } from "lucide-react";
import { toast } from "sonner";
import { useDiscountOptions } from "@/hooks/useDiscountOptions";

export function DescontosTab() {
  const { options, loading, updateOptions, FIELD_LABELS } = useDiscountOptions();
  const [editing, setEditing] = useState<Record<string, number[]>>({});
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, number[]> = {};
    options.forEach((o) => {
      map[o.field_name] = o.percentages.map(Number).sort((a, b) => a - b);
    });
    setEditing(map);
  }, [options]);

  const addValue = (field: string) => {
    const val = parseFloat(newValues[field] || "");
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error("Informe um valor entre 0 e 100");
      return;
    }
    const current = editing[field] || [];
    if (current.includes(val)) {
      toast.error("Valor já existe");
      return;
    }
    setEditing((prev) => ({ ...prev, [field]: [...current, val].sort((a, b) => a - b) }));
    setNewValues((prev) => ({ ...prev, [field]: "" }));
  };

  const removeValue = (field: string, val: number) => {
    setEditing((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((v) => v !== val),
    }));
  };

  const handleSave = async (field: string) => {
    const values = editing[field] || [];
    if (values.length === 0) {
      toast.error("Adicione pelo menos um valor");
      return;
    }
    const error = await updateOptions(field, values);
    if (error) toast.error("Erro ao salvar");
    else toast.success(`Opções de ${FIELD_LABELS[field]} salvas!`);
  };

  if (loading) return <p className="text-muted-foreground text-sm">Carregando...</p>;

  const fields = ["desconto1", "desconto2", "desconto3", "plus"];

  return (
    <div className="space-y-6">
      {fields.map((field) => (
        <Card key={field}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{FIELD_LABELS[field]}</CardTitle>
              <Button size="sm" onClick={() => handleSave(field)} className="gap-1">
                <Save className="h-3 w-3" />Salvar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(editing[field] || []).map((val) => (
                <Badge key={val} variant="secondary" className="text-sm gap-1 px-3 py-1.5">
                  {val}%
                  <button onClick={() => removeValue(field, val)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {(editing[field] || []).length === 0 && (
                <span className="text-sm text-muted-foreground">Nenhum valor configurado</span>
              )}
            </div>
            <div className="flex items-center gap-2 max-w-xs">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="Ex: 5"
                value={newValues[field] || ""}
                onChange={(e) => setNewValues((prev) => ({ ...prev, [field]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addValue(field); }}
                className="h-9"
              />
              <Button size="sm" variant="outline" onClick={() => addValue(field)} className="gap-1 h-9">
                <Plus className="h-3 w-3" />Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
