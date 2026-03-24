import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Download, DollarSign, Package, Wrench, Settings2,
  Sparkles, Check, Link2, Percent, TrendingUp, Calculator, Hammer, Send,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { useSmartBudgetEngine, type EnrichedBudgetItem, type PricingRule } from "@/hooks/useSmartBudgetEngine";
import type { ProjectObject, ModuleLibraryItem } from "@/hooks/useSmartImport3D";
import type { ModuleBOM } from "@/types/parametricModule";
import jsPDF from "jspdf";

interface SmartBudgetPanelProps {
  projectName: string;
  objects: ProjectObject[];
  library: ModuleLibraryItem[];
  tenantId: string | null;
  storeName?: string;
  clientName?: string;
  /** BOM from parametric builder — merged into budget items */
  parametricBOM?: ModuleBOM | null;
  parametricModuleName?: string;
  /** Callback to send budget to simulator */
  onSendToSimulator?: (data: { projectName: string; totalValue: number; moduleCount: number }) => void;
}

const TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  module: { label: "Módulo", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Package },
  accessory: { label: "Acessório", color: "bg-amber-500/10 text-amber-600 border-amber-200", icon: Wrench },
  ferragem: { label: "Ferragem", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: Hammer },
  undefined: { label: "Indefinido", color: "bg-muted text-muted-foreground border-border", icon: Package },
};

export function SmartBudgetPanel({
  projectName, objects, library, tenantId, storeName, clientName,
  parametricBOM, parametricModuleName, onSendToSimulator,
}: SmartBudgetPanelProps) {
  const {
    pricingRules, budgetItems, summary, loadPricingRules,
    savePricingRule, processObjects, updateItem, acceptSuggestion, getRuleForType,
  } = useSmartBudgetEngine(tenantId);

  const [showPricingRules, setShowPricingRules] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ type: "undefined", quantity: "1", unit_cost: "", linked_module_id: "" });
  const [ruleForm, setRuleForm] = useState({ type: "module" as string, markup: "0", margin: "30" });
  const [showLinkModule, setShowLinkModule] = useState<string | null>(null);

  useEffect(() => {
    loadPricingRules();
  }, [loadPricingRules]);

  useEffect(() => {
    if (objects.length > 0) {
      processObjects(objects, library);
    }
  }, [objects, library, pricingRules, processObjects]);

  // Merge parametric BOM into budget items as synthetic objects
  useEffect(() => {
    if (!parametricBOM || parametricBOM.parts.length === 0) return;

    const bomObjects: ProjectObject[] = [
      ...parametricBOM.parts.map((p, i) => ({
        id: `bom-part-${i}`,
        name: `${parametricModuleName || "Módulo"} — ${p.name}`,
        type: "module" as any,
        cost: 0, // cost comes from pricing rules
        project_id: "",
        tenant_id: "",
        created_at: new Date().toISOString(),
        quantity: p.quantity,
        unit_cost: 0,
        identified_type: "module" as any,
      } as any)),
      ...parametricBOM.hardware.map((h, i) => ({
        id: `bom-hw-${i}`,
        name: `${parametricModuleName || "Módulo"} — ${h.name}`,
        type: "ferragem" as any,
        cost: 0,
        project_id: "",
        tenant_id: "",
        created_at: new Date().toISOString(),
        quantity: h.quantity,
        unit_cost: 0,
        identified_type: "ferragem" as any,
      } as any)),
    ];

    if (bomObjects.length > 0) {
      const allObjects = [...objects, ...bomObjects];
      processObjects(allObjects, library);
    }
  }, [parametricBOM, parametricModuleName, objects, library, processObjects]);

  const startEdit = (item: EnrichedBudgetItem) => {
    setEditingItemId(item.id);
    setEditForm({
      type: item.identified_type,
      quantity: String(item.quantity),
      unit_cost: String(item.unit_cost),
      linked_module_id: item.linked_module_id || "",
    });
  };

  const saveEdit = async () => {
    if (!editingItemId) return;
    await updateItem(editingItemId, {
      identified_type: editForm.type as any,
      quantity: Number(editForm.quantity) || 1,
      unit_cost: Number(editForm.unit_cost) || 0,
      linked_module_id: editForm.linked_module_id || null,
    });
    setEditingItemId(null);
  };

  const handleLinkModule = async (itemId: string, mod: ModuleLibraryItem) => {
    await updateItem(itemId, {
      linked_module_id: mod.id,
      unit_cost: mod.cost,
      identified_type: "module",
    });
    setShowLinkModule(null);
    toast_success("Módulo vinculado!");
  };

  const saveRule = async () => {
    await savePricingRule({
      type: ruleForm.type as any,
      markup: Number(ruleForm.markup) || 0,
      margin: Number(ruleForm.margin) || 30,
    });
  };

  const generatePdf = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ORÇAMENTO INTELIGENTE — 3D SMART IMPORT", pw / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${storeName || "Loja"} | ${new Date().toLocaleDateString("pt-BR")}`, pw / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Projeto: ${projectName}`, 20, y);
    y += 5;
    if (clientName) { doc.text(`Cliente: ${clientName}`, 20, y); y += 5; }
    y += 5;

    // Table header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const cols = [20, 80, 110, 125, 145, pw - 20];
    doc.text("Item", cols[0], y);
    doc.text("Tipo", cols[1], y);
    doc.text("Qtd", cols[2], y);
    doc.text("Custo Unit.", cols[3], y);
    doc.text("Valor Final", cols[4], y, { align: "left" });
    y += 3;
    doc.line(20, y, pw - 20, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    for (const item of summary.items) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(item.name.substring(0, 30), cols[0], y);
      doc.text(TYPE_LABELS[item.identified_type]?.label || "—", cols[1], y);
      doc.text(String(item.quantity), cols[2], y);
      doc.text(formatCurrency(item.unit_cost), cols[3], y);
      doc.text(formatCurrency(item.final_value), pw - 20, y, { align: "right" });
      y += 5;
    }

    y += 5;
    doc.line(20, y, pw - 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Módulos:", 20, y); doc.text(formatCurrency(summary.modules_total), pw - 20, y, { align: "right" }); y += 5;
    doc.text("Acessórios:", 20, y); doc.text(formatCurrency(summary.accessories_total), pw - 20, y, { align: "right" }); y += 5;
    doc.text("Ferragens:", 20, y); doc.text(formatCurrency(summary.ferragens_total), pw - 20, y, { align: "right" }); y += 5;
    y += 3;
    doc.setFontSize(10);
    doc.text("Custo Total:", 20, y); doc.text(formatCurrency(summary.cost_total), pw - 20, y, { align: "right" }); y += 6;
    doc.text("Margem:", 20, y); doc.text(formatCurrency(summary.margin_total), pw - 20, y, { align: "right" }); y += 6;
    doc.setFontSize(13);
    doc.text("VALOR FINAL:", 20, y); doc.text(formatCurrency(summary.final_total), pw - 20, y, { align: "right" });

    // Footer
    y = doc.internal.pageSize.getHeight() - 12;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text("Gerado via Motor de Orçamento Inteligente — OrçaMóvel PRO", pw / 2, y, { align: "center" });

    doc.save(`orcamento-smart-${projectName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const hasSuggestions = budgetItems.some(i => i.suggested_type || i.suggested_module);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" /> Orçamento Inteligente
        </h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowPricingRules(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Regras de Preço
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={generatePdf}
            disabled={summary.item_count === 0}>
            <Download className="h-3.5 w-3.5" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: "Módulos", value: formatCurrency(summary.modules_total), icon: Package, color: "text-blue-500" },
          { label: "Acessórios", value: formatCurrency(summary.accessories_total), icon: Wrench, color: "text-amber-500" },
          { label: "Ferragens", value: formatCurrency(summary.ferragens_total), icon: Hammer, color: "text-emerald-500" },
          { label: "Margem", value: formatCurrency(summary.margin_total), icon: TrendingUp, color: "text-primary" },
          { label: "Total Final", value: formatCurrency(summary.final_total), icon: DollarSign, color: "text-primary" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-2.5 text-center">
              <s.icon className={`h-3.5 w-3.5 mx-auto mb-0.5 ${s.color}`} />
              <p className="text-sm font-bold text-foreground">{s.value}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Suggestions Banner */}
      {hasSuggestions && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground">Sugestões Inteligentes Disponíveis</p>
              <p className="text-[10px] text-muted-foreground">
                {budgetItems.filter(i => i.suggested_type || i.suggested_module).length} itens com sugestões de classificação ou módulo
              </p>
            </div>
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
              budgetItems.forEach(i => { if (i.suggested_type || i.suggested_module) acceptSuggestion(i.id); });
            }}>
              <Check className="h-3 w-3" /> Aceitar Todas
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Items Table */}
      {summary.item_count === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Clique nos objetos do modelo 3D para gerar o orçamento automático
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Custo Unit.</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Valor Final</TableHead>
                  <TableHead className="w-28">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetItems.map(item => {
                  const typeInfo = TYPE_LABELS[item.identified_type] || TYPE_LABELS.undefined;
                  const TypeIcon = typeInfo.icon;
                  const isEditing = editingItemId === item.id;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{item.name}</span>
                          {item.suggested_type && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Sparkles className="h-3 w-3 text-primary" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Sugestão: {TYPE_LABELS[item.suggested_type]?.label}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select value={editForm.type} onValueChange={v => setEditForm(p => ({ ...p, type: v }))}>
                            <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="module">Módulo</SelectItem>
                              <SelectItem value="accessory">Acessório</SelectItem>
                              <SelectItem value="ferragem">Ferragem</SelectItem>
                              <SelectItem value="undefined">Indefinido</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={`text-[10px] ${typeInfo.color}`}>
                            <TypeIcon className="h-2.5 w-2.5 mr-1" /> {typeInfo.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.linked_module_name ? (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Link2 className="h-2.5 w-2.5" /> {item.linked_module_name}
                          </Badge>
                        ) : item.suggested_module ? (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary gap-1"
                            onClick={() => acceptSuggestion(item.id)}>
                            <Sparkles className="h-2.5 w-2.5" /> {item.suggested_module.name}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1"
                            onClick={() => setShowLinkModule(item.id)}>
                            <Link2 className="h-2.5 w-2.5" /> Vincular
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <Input type="number" className="h-7 text-xs w-16 text-center"
                            value={editForm.quantity} onChange={e => setEditForm(p => ({ ...p, quantity: e.target.value }))} />
                        ) : (
                          <span className="font-mono text-sm">{item.quantity}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input type="number" className="h-7 text-xs w-24 ml-auto"
                            value={editForm.unit_cost} onChange={e => setEditForm(p => ({ ...p, unit_cost: e.target.value }))} />
                        ) : (
                          <span className="font-mono text-sm">{formatCurrency(item.unit_cost)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-xs text-muted-foreground">{item.margin}%</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(item.final_value)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isEditing ? (
                            <Button size="sm" className="h-7 text-xs" onClick={saveEdit}>Salvar</Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(item)}>
                                Editar
                              </Button>
                              {(item.suggested_type || item.suggested_module) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary"
                                      onClick={() => acceptSuggestion(item.id)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aceitar sugestão IA</TooltipContent>
                                </Tooltip>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pricing Rules Dialog */}
      <Dialog open={showPricingRules} onOpenChange={setShowPricingRules}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" /> Regras de Preço
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Defina margem e markup por tipo de item. O valor final será: Custo × (1 + Margem%)
            </p>

            {/* Current rules */}
            {pricingRules.length > 0 && (
              <div className="space-y-2">
                {pricingRules.map(rule => (
                  <Card key={rule.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <Badge variant="outline">{TYPE_LABELS[rule.type]?.label || rule.type}</Badge>
                      <div className="flex gap-3 text-xs">
                        <span>Markup: <strong>{rule.markup}%</strong></span>
                        <span>Margem: <strong>{rule.margin}%</strong></span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Add/Edit rule */}
            <div className="space-y-3 border-t pt-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={ruleForm.type} onValueChange={v => setRuleForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="module">Módulo</SelectItem>
                    <SelectItem value="accessory">Acessório</SelectItem>
                    <SelectItem value="ferragem">Ferragem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Markup (%)</Label>
                  <Input type="number" className="h-9 mt-1" value={ruleForm.markup}
                    onChange={e => setRuleForm(p => ({ ...p, markup: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Margem (%)</Label>
                  <Input type="number" className="h-9 mt-1" value={ruleForm.margin}
                    onChange={e => setRuleForm(p => ({ ...p, margin: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPricingRules(false)}>Fechar</Button>
            <Button onClick={saveRule} className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Salvar Regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Module Dialog */}
      <Dialog open={!!showLinkModule} onOpenChange={() => setShowLinkModule(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Vincular Módulo da Biblioteca
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {library.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum módulo na biblioteca. Cadastre módulos primeiro.
              </p>
            ) : (
              library.map(mod => (
                <Card key={mod.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => showLinkModule && handleLinkModule(showLinkModule, mod)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{mod.name}</p>
                      <p className="text-[10px] text-muted-foreground">{mod.type} • {mod.materials}</p>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatCurrency(mod.cost)}</span>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to avoid import of toast in this file scope
function toast_success(msg: string) {
  import("sonner").then(({ toast }) => toast.success(msg));
}
