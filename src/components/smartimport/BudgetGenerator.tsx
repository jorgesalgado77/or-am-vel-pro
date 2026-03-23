import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Download, DollarSign, Package, Wrench,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import type { ProjectObject } from "@/hooks/useSmartImport3D";
import jsPDF from "jspdf";

interface BudgetGeneratorProps {
  projectName: string;
  objects: ProjectObject[];
  storeName?: string;
  clientName?: string;
  onClassify: (objectId: string, type: "module" | "accessory" | "undefined", cost?: number) => Promise<boolean>;
}

export function BudgetGenerator({ projectName, objects, storeName, clientName, onClassify }: BudgetGeneratorProps) {
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState("");
  const [editType, setEditType] = useState<"module" | "accessory" | "undefined">("undefined");

  const modules = objects.filter(o => o.type === "module");
  const accessories = objects.filter(o => o.type === "accessory");
  const unclassified = objects.filter(o => o.type === "undefined");

  const modulesTotal = modules.reduce((sum, m) => sum + (m.cost || 0), 0);
  const accessoriesTotal = accessories.reduce((sum, a) => sum + (a.cost || 0), 0);
  const total = modulesTotal + accessoriesTotal;

  const startClassify = (obj: ProjectObject) => {
    setEditingObjectId(obj.id);
    setEditType(obj.type);
    setEditCost(String(obj.cost || ""));
  };

  const saveClassification = async () => {
    if (!editingObjectId) return;
    await onClassify(editingObjectId, editType, editCost ? Number(editCost) : undefined);
    setEditingObjectId(null);
    setEditCost("");
  };

  const generatePdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 25;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ORÇAMENTO - 3D SMART IMPORT", pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitido por: ${storeName || "Loja"}`, pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    doc.setDrawColor(200);
    doc.line(20, y, pageWidth - 20, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Projeto: ${projectName}`, 20, y);
    y += 6;
    if (clientName) {
      doc.text(`Cliente: ${clientName}`, 20, y);
      y += 6;
    }
    y += 5;

    // Modules
    if (modules.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("MÓDULOS", 20, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      modules.forEach((m, i) => {
        doc.text(`${i + 1}. ${m.name}`, 25, y);
        doc.text(formatCurrency(m.cost || 0), pageWidth - 25, y, { align: "right" });
        y += 5;
      });
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.text("Subtotal Módulos:", 25, y);
      doc.text(formatCurrency(modulesTotal), pageWidth - 25, y, { align: "right" });
      y += 10;
    }

    // Accessories
    if (accessories.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("ACESSÓRIOS", 20, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      accessories.forEach((a, i) => {
        doc.text(`${i + 1}. ${a.name}`, 25, y);
        doc.text(formatCurrency(a.cost || 0), pageWidth - 25, y, { align: "right" });
        y += 5;
      });
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.text("Subtotal Acessórios:", 25, y);
      doc.text(formatCurrency(accessoriesTotal), pageWidth - 25, y, { align: "right" });
      y += 10;
    }

    // Total
    doc.setDrawColor(0);
    doc.line(20, y, pageWidth - 20, y);
    y += 8;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("VALOR TOTAL:", 20, y);
    doc.text(formatCurrency(total), pageWidth - 20, y, { align: "right" });

    // Footer
    y = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text("Gerado via 3D Smart Import — OrçaMóvel PRO", pageWidth / 2, y, { align: "center" });

    doc.save(`orcamento-3d-${projectName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Orçamento do Projeto
        </h4>
        <Button size="sm" className="gap-1.5 text-xs" onClick={generatePdf}
          disabled={modules.length === 0 && accessories.length === 0}>
          <Download className="h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Módulos", value: modules.length, icon: Package, color: "text-blue-500" },
          { label: "Acessórios", value: accessories.length, icon: Wrench, color: "text-amber-500" },
          { label: "Não Classif.", value: unclassified.length, icon: Package, color: "text-muted-foreground" },
          { label: "Total", value: formatCurrency(total), icon: DollarSign, color: "text-primary" },
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

      {/* Objects Table */}
      {objects.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Clique nos objetos do modelo 3D para listá-los aqui
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="w-24">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {objects.map(obj => (
                  <TableRow key={obj.id}>
                    <TableCell className="text-sm">{obj.name}</TableCell>
                    <TableCell>
                      {editingObjectId === obj.id ? (
                        <Select value={editType} onValueChange={v => setEditType(v as any)}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="module">Módulo</SelectItem>
                            <SelectItem value="accessory">Acessório</SelectItem>
                            <SelectItem value="undefined">Indefinido</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={obj.type === "module" ? "default" : obj.type === "accessory" ? "secondary" : "outline"}
                          className="text-[10px]">
                          {obj.type === "module" ? "Módulo" : obj.type === "accessory" ? "Acessório" : "—"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingObjectId === obj.id ? (
                        <Input type="number" className="h-7 text-xs w-24 ml-auto" placeholder="0.00"
                          value={editCost} onChange={e => setEditCost(e.target.value)} />
                      ) : (
                        <span className="font-mono text-sm">{obj.cost ? formatCurrency(obj.cost) : "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingObjectId === obj.id ? (
                        <Button size="sm" className="h-7 text-xs" onClick={saveClassification}>Salvar</Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startClassify(obj)}>
                          Classificar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
