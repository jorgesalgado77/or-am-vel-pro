import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit2, Save, Settings2, Palette, Wrench, GripVertical } from "lucide-react";
import type { CatalogItem } from "@/hooks/useModuleCatalog";

const CATEGORIES: { value: CatalogItem["category"]; label: string; icon: any }[] = [
  { value: "ferragem", label: "Ferragens", icon: Wrench },
  { value: "dobradica", label: "Dobradiças", icon: Wrench },
  { value: "corredica", label: "Corrediças", icon: Wrench },
  { value: "puxador", label: "Puxadores", icon: GripVertical },
  { value: "porta_frente", label: "Portas/Frentes", icon: Settings2 },
  { value: "fundo", label: "Tipos de Fundo", icon: Settings2 },
  { value: "fita_borda", label: "Fitas de Borda", icon: Settings2 },
  { value: "material", label: "Materiais", icon: Settings2 },
  { value: "acabamento", label: "Acabamentos", icon: Palette },
  { value: "cor", label: "Cores", icon: Palette },
];

interface Props {
  catalogItems: CatalogItem[];
  onAdd: (item: Omit<CatalogItem, "id" | "tenant_id" | "created_at">) => Promise<any>;
  onUpdate: (id: string, updates: Partial<CatalogItem>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function ModuleCatalogAdmin({ catalogItems, onAdd, onUpdate, onDelete }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "ferragem" as CatalogItem["category"], description: "", cost: "" });
  const [activeTab, setActiveTab] = useState("ferragem");

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      category: form.category,
      description: form.description || undefined,
      cost: form.cost ? Number(form.cost) : undefined,
    };
    if (editingId) {
      await onUpdate(editingId, payload);
    } else {
      await onAdd(payload);
    }
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", category: activeTab as CatalogItem["category"], description: "", cost: "" });
    setEditingId(null);
    setShowAdd(false);
  };

  const startEdit = (item: CatalogItem) => {
    setForm({ name: item.name, category: item.category, description: item.description || "", cost: item.cost ? String(item.cost) : "" });
    setEditingId(item.id);
    setShowAdd(true);
  };

  const getItems = (cat: string) => catalogItems.filter(i => i.category === cat);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" /> Catálogo de Componentes
          <Badge variant="secondary" className="text-[10px]">{catalogItems.length} itens</Badge>
        </h4>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => { resetForm(); setForm(p => ({ ...p, category: activeTab as any })); setShowAdd(true); }}>
          <Plus className="h-3.5 w-3.5" /> Novo Item
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {CATEGORIES.map(cat => (
            <TabsTrigger key={cat.value} value={cat.value} className="text-xs gap-1">
              <cat.icon className="h-3 w-3" /> {cat.label}
              <Badge variant="outline" className="text-[9px] ml-1">{getItems(cat.value).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map(cat => (
          <TabsContent key={cat.value} value={cat.value}>
            {getItems(cat.value).length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <cat.icon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum(a) {cat.label.toLowerCase()} cadastrado(a)</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="w-20">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getItems(cat.value).map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm font-medium">{item.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.description || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{item.cost ? `R$ ${item.cost.toFixed(2)}` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(item.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={showAdd} onOpenChange={v => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Item" : "Novo Item do Catálogo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v as any }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nome</Label>
              <Input className="h-9 mt-1" placeholder="Ex: Dobradiça 35mm com amortecedor"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input className="h-9 mt-1" placeholder="Detalhes adicionais"
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Custo (R$)</Label>
              <Input type="number" className="h-9 mt-1" placeholder="0.00"
                value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-1.5" disabled={!form.name.trim()}>
              <Save className="h-3.5 w-3.5" /> {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
