import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, Plus, Trash2, Edit2, Save, DollarSign, Package,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import type { ModuleLibraryItem } from "@/hooks/useSmartImport3D";

interface ModuleLibraryPanelProps {
  library: ModuleLibraryItem[];
  onAdd: (item: Omit<ModuleLibraryItem, "id" | "tenant_id" | "created_at">) => Promise<any>;
  onUpdate: (id: string, updates: Partial<ModuleLibraryItem>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const MODULE_TYPES = [
  "Aéreo", "Base", "Torre", "Bancada", "Gabinete", "Painel",
  "Estante", "Prateleira", "Nicho", "Tamponamento", "Outro",
];

export function ModuleLibraryPanel({ library, onAdd, onUpdate, onDelete }: ModuleLibraryPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "Outro", cost: "", materials: "" });
  const [filter, setFilter] = useState("");

  const handleSave = async () => {
    if (!form.name.trim() || !form.cost) return;
    if (editingId) {
      await onUpdate(editingId, {
        name: form.name,
        type: form.type,
        cost: Number(form.cost),
        materials: form.materials,
      });
    } else {
      await onAdd({
        name: form.name,
        type: form.type,
        cost: Number(form.cost),
        materials: form.materials,
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", type: "Outro", cost: "", materials: "" });
    setEditingId(null);
    setShowAdd(false);
  };

  const startEdit = (item: ModuleLibraryItem) => {
    setForm({ name: item.name, type: item.type, cost: String(item.cost), materials: item.materials });
    setEditingId(item.id);
    setShowAdd(true);
  };

  const filtered = library.filter(item =>
    item.name.toLowerCase().includes(filter.toLowerCase()) ||
    item.type.toLowerCase().includes(filter.toLowerCase())
  );

  const totalValue = library.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Biblioteca de Módulos
          <Badge variant="secondary" className="text-[10px]">{library.length} itens</Badge>
        </h4>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus className="h-3.5 w-3.5" /> Novo Módulo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <Package className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{library.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Módulos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <DollarSign className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-sm font-bold text-foreground">{formatCurrency(totalValue)}</p>
          <p className="text-[10px] text-muted-foreground">Valor Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <DollarSign className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-sm font-bold text-foreground">
            {library.length > 0 ? formatCurrency(totalValue / library.length) : "R$ 0"}
          </p>
          <p className="text-[10px] text-muted-foreground">Custo Médio</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar módulo..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="h-8 text-sm"
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {library.length === 0 ? "Nenhum módulo cadastrado" : "Nenhum resultado encontrado"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.materials || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(item.cost)}</TableCell>
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

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Módulo" : "Novo Módulo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do Módulo</Label>
              <Input className="h-9 mt-1" placeholder="Ex: Aéreo 80cm 2 Portas"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Custo (R$)</Label>
              <Input type="number" className="h-9 mt-1" placeholder="0.00"
                value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Material</Label>
              <Input className="h-9 mt-1" placeholder="Ex: MDF 18mm Branco TX"
                value={form.materials} onChange={e => setForm(p => ({ ...p, materials: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-1.5" disabled={!form.name.trim() || !form.cost}>
              <Save className="h-3.5 w-3.5" /> {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
