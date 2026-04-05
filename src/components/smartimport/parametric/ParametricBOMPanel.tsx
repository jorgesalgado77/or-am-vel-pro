/**
 * ParametricBOMPanel — Bill of Materials table extracted from ParametricEditor.
 */

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Wrench } from "lucide-react";
import type { ModuleBOM } from "@/types/parametricModule";

interface ParametricBOMPanelProps {
  bom: ModuleBOM;
}

export function ParametricBOMPanel({ bom }: ParametricBOMPanelProps) {
  return (
    <Card className="max-h-[200px] overflow-hidden">
      <Tabs defaultValue="pecas" className="h-full">
        <TabsList className="h-7 px-2">
          <TabsTrigger value="pecas" className="text-[10px] h-5 gap-1">
            <Package className="h-3 w-3" /> Peças ({bom.parts.length})
          </TabsTrigger>
          <TabsTrigger value="ferragens" className="text-[10px] h-5 gap-1">
            <Wrench className="h-3 w-3" /> Ferragens ({bom.hardware.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pecas" className="m-0 overflow-auto max-h-[150px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] h-6">Peça</TableHead>
                <TableHead className="text-[10px] h-6 text-right">Qtd</TableHead>
                <TableHead className="text-[10px] h-6 text-right">L×A (mm)</TableHead>
                <TableHead className="text-[10px] h-6 text-right">Área m²</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bom.parts.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[10px] py-1">{p.name}</TableCell>
                  <TableCell className="text-[10px] py-1 text-right">{p.quantity}</TableCell>
                  <TableCell className="text-[10px] py-1 text-right font-mono">{p.width.toFixed(0)}×{p.height.toFixed(0)}</TableCell>
                  <TableCell className="text-[10px] py-1 text-right font-mono">{p.area.toFixed(3)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="text-[10px] py-1 font-semibold">Total</TableCell>
                <TableCell className="text-[10px] py-1" />
                <TableCell className="text-[10px] py-1" />
                <TableCell className="text-[10px] py-1 text-right font-mono font-semibold">{bom.totalArea.toFixed(3)} m²</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="ferragens" className="m-0 overflow-auto max-h-[150px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] h-6">Item</TableHead>
                <TableHead className="text-[10px] h-6 text-right">Qtd</TableHead>
                <TableHead className="text-[10px] h-6 text-right">Un.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bom.hardware.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[10px] py-1">{h.name}</TableCell>
                  <TableCell className="text-[10px] py-1 text-right">{h.quantity}</TableCell>
                  <TableCell className="text-[10px] py-1 text-right">{h.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
