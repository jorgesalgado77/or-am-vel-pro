import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
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

  const saveField = async (field: string, values: number[]) => {
    const error = await updateOptions(field, values);
    if (error) toast.error("Erro ao salvar");
    else toast.success(`${FIELD_LABELS[field]} atualizado!`);
  };

  const addValue = async (field: string) => {
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
    const updated = [...current, val].sort((a, b) => a - b);
    setEditing((prev) => ({ ...prev, [field]: updated }));
    setNewValues((prev) => ({ ...prev, [field]: "" }));
    await saveField(field, updated);
  };

  const removeValue = async (field: string, val: number) => {
    const updated = (editing[field] || []).filter((v) => v !== val);
    setEditing((prev) => ({ ...prev, [field]: updated }));
    if (updated.length > 0) {
      await saveField(field, updated);
    } else {
      toast.info("Último valor removido — adicione um novo para salvar");
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Carregando...</p>;

  const fields = ["desconto1", "desconto2", "desconto3", "plus"];

  return (
    <div className="space-y-6">
      {fields.map((field) => (
        <Card key={field}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{FIELD_LABELS[field]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(editing[field] || []).map((val) => (
                <Badge
                  key={val}
                  variant="secondary"
                  className="text-sm gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                  onClick={() => removeValue(field, val)}
                  title="Clique para remover"
                >
                  {val}%
                  <X className="h-3 w-3" />
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
