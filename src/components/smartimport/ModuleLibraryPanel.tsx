import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BookOpen, Plus, Trash2, Edit2, Save, DollarSign, Package, Ruler, Palette, Wrench, Copy, MessageSquare,
  FolderTree, ChevronRight, ChevronDown, FolderPlus, Folder, FolderOpen,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import type { ModuleLibraryItem } from "@/hooks/useSmartImport3D";
import type { CatalogItem } from "@/hooks/useModuleCatalog";
import type { CategoryTreeNode, ModuleCategory } from "@/hooks/useModuleCategories";

interface ModuleLibraryPanelProps {
  library: ModuleLibraryItem[];
  catalogItems?: CatalogItem[];
  categories?: CategoryTreeNode[];
  selectedCategoryId?: string | null;
  onCategorySelect?: (id: string | null) => void;
  onCategoryAdd?: (name: string, parentId: string | null) => Promise<any>;
  onCategoryDelete?: (id: string) => Promise<boolean>;
  onAdd: (item: Omit<ModuleLibraryItem, "id" | "tenant_id" | "created_at">) => Promise<any>;
  onUpdate: (id: string, updates: Partial<ModuleLibraryItem>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const MODULE_TYPES = [
  "Aéreo", "Base", "Torre", "Bancada", "Gabinete", "Painel",
  "Estante", "Prateleira", "Nicho", "Tamponamento", "Outro",
];

interface ModuleForm {
  name: string;
  type: string;
  cost: string;
  materials: string;
  width: string;
  height: string;
  depth: string;
  dobradica_id: string;
  puxador_id: string;
  fundo_tipo_id: string;
  porta_frente_id: string;
  corredica_id: string;
  agregados: string;
  ferragens_montagem: string;
  cor_caixa: string;
  cor_porta: string;
  cor_tamponamento: string;
  cor_fita_borda: string;
  cor_fundo: string;
  cor_paineis_tampo: string;
  extra_cores: { label: string; value: string }[];
  observacoes: string;
}

const EMPTY_FORM: ModuleForm = {
  name: "", type: "Outro", cost: "", materials: "",
  width: "", height: "", depth: "",
  dobradica_id: "", puxador_id: "", fundo_tipo_id: "",
  porta_frente_id: "", corredica_id: "",
  agregados: "", ferragens_montagem: "",
  cor_caixa: "", cor_porta: "", cor_tamponamento: "", cor_fita_borda: "",
  cor_fundo: "", cor_paineis_tampo: "",
  extra_cores: [],
  observacoes: "",
};

// Helper to render a color field with duplicate button
function ColorField({
  label, value, onChange, cores, onDuplicate,
}: {
  label: string; value: string; onChange: (v: string) => void;
  cores: CatalogItem[]; onDuplicate: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground">{label}</Label>
        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="Duplicar campo"
          onClick={onDuplicate}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      {cores.length > 0 ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            {cores.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input className="h-9 mt-0.5" placeholder="Ex: Branco TX"
          value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function ModuleLibraryPanel({
  library, catalogItems = [], onAdd, onUpdate, onDelete,
  categories = [], selectedCategoryId, onCategorySelect, onCategoryAdd, onCategoryDelete,
}: ModuleLibraryPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ModuleForm>(EMPTY_FORM);
  const [filter, setFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategoryParentId, setAddingCategoryParentId] = useState<string | null | undefined>(undefined);

  const catalogByCategory = useMemo(() => {
    const map: Record<string, CatalogItem[]> = {};
    catalogItems.forEach(i => {
      if (!map[i.category]) map[i.category] = [];
      map[i.category].push(i);
    });
    return map;
  }, [catalogItems]);

  const ferragens = catalogByCategory["ferragem"] || [];
  const puxadores = catalogByCategory["puxador"] || [];
  const fundos = catalogByCategory["fundo"] || [];
  const cores = catalogByCategory["cor"] || [];

  const handleSave = async () => {
    if (!form.name.trim() || !form.cost) return;

    const dobradicaItem = ferragens.find(f => f.id === form.dobradica_id);
    const puxadorItem = puxadores.find(p => p.id === form.puxador_id);
    const fundoItem = fundos.find(f => f.id === form.fundo_tipo_id);

    const payload: any = {
      name: form.name,
      type: form.type,
      cost: Number(form.cost),
      materials: form.materials,
      width: form.width ? Number(form.width) : null,
      height: form.height ? Number(form.height) : null,
      depth: form.depth ? Number(form.depth) : null,
      ferragem_id: form.dobradica_id || null,
      ferragem_name: dobradicaItem?.name || null,
      puxador_id: form.puxador_id || null,
      puxador_name: puxadorItem?.name || null,
      fundo_tipo_id: form.fundo_tipo_id || null,
      fundo_tipo_name: fundoItem?.name || null,
      cor_caixa: form.cor_caixa || null,
      cor_porta: form.cor_porta || null,
      cor_tamponamento: form.cor_tamponamento || null,
      cor_fita_borda: form.cor_fita_borda || null,
    };

    if (editingId) {
      await onUpdate(editingId, payload);
    } else {
      await onAdd(payload);
    }
    resetForm();
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowAdd(false);
  };

  const startEdit = (item: ModuleLibraryItem) => {
    setForm({
      name: item.name,
      type: item.type,
      cost: String(item.cost),
      materials: item.materials,
      width: item.width ? String(item.width) : "",
      height: item.height ? String(item.height) : "",
      depth: item.depth ? String(item.depth) : "",
      dobradica_id: item.ferragem_id || "",
      puxador_id: item.puxador_id || "",
      fundo_tipo_id: item.fundo_tipo_id || "",
      porta_frente_id: "",
      corredica_id: "",
      agregados: "",
      ferragens_montagem: "",
      cor_caixa: item.cor_caixa || "",
      cor_porta: item.cor_porta || "",
      cor_tamponamento: item.cor_tamponamento || "",
      cor_fita_borda: item.cor_fita_borda || "",
      cor_fundo: "",
      cor_paineis_tampo: "",
      extra_cores: [],
      observacoes: "",
    });
    setEditingId(item.id);
    setShowAdd(true);
  };

  const handleNameSelect = (selectedName: string) => {
    const existing = library.find(m => m.name === selectedName);
    if (existing && !editingId) {
      setForm(prev => ({
        ...prev,
        name: existing.name,
        type: existing.type,
        cost: String(existing.cost),
        materials: existing.materials,
        width: existing.width ? String(existing.width) : "",
        height: existing.height ? String(existing.height) : "",
        depth: existing.depth ? String(existing.depth) : "",
        dobradica_id: existing.ferragem_id || "",
        puxador_id: existing.puxador_id || "",
        fundo_tipo_id: existing.fundo_tipo_id || "",
        cor_caixa: existing.cor_caixa || "",
        cor_porta: existing.cor_porta || "",
        cor_tamponamento: existing.cor_tamponamento || "",
        cor_fita_borda: existing.cor_fita_borda || "",
      }));
    }
  };

  const addExtraColor = (label: string) => {
    setForm(prev => ({
      ...prev,
      extra_cores: [...prev.extra_cores, { label: `${label} (cópia)`, value: "" }],
    }));
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
      <Input placeholder="Buscar módulo..." value={filter} onChange={e => setFilter(e.target.value)} className="h-8 text-sm" />

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
                  <TableHead>Dimensões</TableHead>
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
                    <TableCell className="text-xs text-muted-foreground">
                      {item.width || item.height || item.depth
                        ? `${item.width || "—"} × ${item.height || "—"} × ${item.depth || "—"} mm`
                        : "—"}
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
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Módulo" : "Novo Módulo"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Nome do Módulo</Label>
                  <Input className="h-9 mt-1" placeholder="Ex: Aéreo 80cm 2 Portas"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    onBlur={() => handleNameSelect(form.name)}
                  />
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
                <div className="col-span-2">
                  <Label className="text-xs">Material Principal</Label>
                  <Input className="h-9 mt-1" placeholder="Ex: MDF 18mm Branco TX"
                    value={form.materials} onChange={e => setForm(p => ({ ...p, materials: e.target.value }))} />
                </div>
              </div>

              <Separator />

              {/* Dimensions */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1 mb-2">
                  <Ruler className="h-3 w-3 text-primary" /> Dimensões (mm)
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Largura</Label>
                    <Input type="number" className="h-9 mt-0.5" placeholder="0"
                      value={form.width} onChange={e => setForm(p => ({ ...p, width: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Altura</Label>
                    <Input type="number" className="h-9 mt-0.5" placeholder="0"
                      value={form.height} onChange={e => setForm(p => ({ ...p, height: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Profundidade</Label>
                    <Input type="number" className="h-9 mt-0.5" placeholder="0"
                      value={form.depth} onChange={e => setForm(p => ({ ...p, depth: e.target.value }))} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Components from Catalog */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1 mb-2">
                  <Wrench className="h-3 w-3 text-primary" /> Componentes
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Tipo de Porta/Frente */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Tipo de Porta/Frente</Label>
                    <Select value={form.porta_frente_id} onValueChange={v => setForm(p => ({ ...p, porta_frente_id: v }))}>
                      <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {ferragens.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Puxador */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Puxador</Label>
                    <Select value={form.puxador_id} onValueChange={v => setForm(p => ({ ...p, puxador_id: v }))}>
                      <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {puxadores.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Tipo de Dobradiça */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Tipo de Dobradiça</Label>
                    <Select value={form.dobradica_id} onValueChange={v => setForm(p => ({ ...p, dobradica_id: v }))}>
                      <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {ferragens.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Tipo de Corrediça */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Tipo de Corrediça</Label>
                    <Select value={form.corredica_id} onValueChange={v => setForm(p => ({ ...p, corredica_id: v }))}>
                      <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {ferragens.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Tipo de Fundo */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Tipo de Fundo</Label>
                    <Select value={form.fundo_tipo_id} onValueChange={v => setForm(p => ({ ...p, fundo_tipo_id: v }))}>
                      <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {fundos.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Agregados */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Agregados</Label>
                    <Input className="h-9 mt-0.5" placeholder="Ex: Bandeja giratória, iluminação"
                      value={form.agregados} onChange={e => setForm(p => ({ ...p, agregados: e.target.value }))} />
                  </div>
                  {/* Ferragens de Montagem */}
                  <div className="col-span-2">
                    <Label className="text-[10px] text-muted-foreground">Ferragens de Montagem</Label>
                    <Input className="h-9 mt-0.5" placeholder="Ex: Minifix, cavilha, parafusos"
                      value={form.ferragens_montagem} onChange={e => setForm(p => ({ ...p, ferragens_montagem: e.target.value }))} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Colors */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1 mb-2">
                  <Palette className="h-3 w-3 text-primary" /> Cores e Acabamentos
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="Cor da Caixa" value={form.cor_caixa}
                    onChange={v => setForm(p => ({ ...p, cor_caixa: v }))}
                    cores={cores} onDuplicate={() => addExtraColor("Cor da Caixa")} />
                  <ColorField label="Cor da Porta" value={form.cor_porta}
                    onChange={v => setForm(p => ({ ...p, cor_porta: v }))}
                    cores={cores} onDuplicate={() => addExtraColor("Cor da Porta")} />
                  <ColorField label="Cor do Tamponamento" value={form.cor_tamponamento}
                    onChange={v => setForm(p => ({ ...p, cor_tamponamento: v }))}
                    cores={cores} onDuplicate={() => addExtraColor("Cor do Tamponamento")} />
                  <ColorField label="Cor Fita de Borda" value={form.cor_fita_borda}
                    onChange={v => setForm(p => ({ ...p, cor_fita_borda: v }))}
                    cores={cores} onDuplicate={() => addExtraColor("Cor Fita de Borda")} />
                  <ColorField label="Cor do Fundo" value={form.cor_fundo}
                    onChange={v => setForm(p => ({ ...p, cor_fundo: v }))}
                    cores={cores} onDuplicate={() => addExtraColor("Cor do Fundo")} />
                  <ColorField label="Cor dos Painéis/Tampo" value={form.cor_paineis_tampo}
                    onChange={v => setForm(p => ({ ...p, cor_paineis_tampo: v }))}
                    cores={cores} onDuplicate={() => addExtraColor("Cor dos Painéis/Tampo")} />

                  {/* Extra duplicated color fields */}
                  {form.extra_cores.map((extra, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">{extra.label}</Label>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                          onClick={() => setForm(p => ({
                            ...p,
                            extra_cores: p.extra_cores.filter((_, i) => i !== idx),
                          }))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {cores.length > 0 ? (
                        <Select value={extra.value} onValueChange={v => {
                          setForm(p => {
                            const updated = [...p.extra_cores];
                            updated[idx] = { ...updated[idx], value: v };
                            return { ...p, extra_cores: updated };
                          });
                        }}>
                          <SelectTrigger className="h-9 mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhuma</SelectItem>
                            {cores.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input className="h-9 mt-0.5" placeholder="Ex: Branco TX"
                          value={extra.value} onChange={e => {
                            setForm(p => {
                              const updated = [...p.extra_cores];
                              updated[idx] = { ...updated[idx], value: e.target.value };
                              return { ...p, extra_cores: updated };
                            });
                          }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Observations */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1 mb-2">
                  <MessageSquare className="h-3 w-3 text-primary" /> Outros Materiais ou Observações
                </Label>
                <Textarea
                  className="min-h-[80px] text-sm"
                  placeholder="Descreva materiais adicionais, observações ou detalhes especiais (máx. 300 caracteres)"
                  maxLength={300}
                  value={form.observacoes}
                  onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground text-right mt-1">
                  {form.observacoes.length}/300
                </p>
              </div>
            </div>
          </ScrollArea>
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
