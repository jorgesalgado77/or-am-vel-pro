/**
 * ParametricPreview3D — 3D canvas, camera views, toolbar, and export controls.
 * Extracted from ParametricEditor.
 */

import { useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, Camera, FileDown,
  Lock, Unlock, Trash2, MousePointer, Group, Shield, ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { COTA_LEGEND } from "@/lib/dimensionAnnotations";
import { MODULE_PRESETS } from "@/types/parametricModule";
import type { ParametricModule } from "@/types/parametricModule";

interface DuplicatedModule {
  id: string;
  module: ParametricModule;
  positionX: number;
  positionZ: number;
}

interface WallConfig {
  enabled: boolean;
  width: number;
  height: number;
  depth: number;
  color: string;
}

export interface ParametricPreview3DProps {
  module: ParametricModule;
  wall: WallConfig;
  duplicates: DuplicatedModule[];
  showCotas: boolean;
  openDoors: boolean;
  openDrawers: boolean;
  lockPosition: boolean;
  groupSelect: boolean;
  collisionEnabled: boolean;
  selectedModuleId: string | null;
  computedFloorOffset: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  threeRef: React.MutableRefObject<any>;
  cameraAnimRef: React.MutableRefObject<{
    startPos: [number, number, number];
    endPos: [number, number, number];
    startTarget: [number, number, number];
    endTarget: [number, number, number];
    progress: number;
    active: boolean;
  }>;
  updatePersisted: (partial: Record<string, unknown>) => void;
  deleteSelectedModule: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}

const CAMERA_VIEWS = [
  { label: "Frontal", icon: "F", pos: [0, 0.5, 1], target: [0, 0.5, 0] },
  { label: "Traseira", icon: "T", pos: [0, 0.5, -1], target: [0, 0.5, 0] },
  { label: "Esquerda", icon: "E", pos: [-1, 0.5, 0], target: [0, 0.5, 0] },
  { label: "Direita", icon: "D", pos: [1, 0.5, 0], target: [0, 0.5, 0] },
  { label: "Planta", icon: "P", pos: [0, 1, 0.01], target: [0, 0, 0] },
  { label: "Perspectiva", icon: "3D", pos: [1, 0.7, 1], target: [0, 0.3, 0] },
] as const;

export function ParametricPreview3D({
  module, wall, duplicates, showCotas, openDoors, openDrawers,
  lockPosition, groupSelect, collisionEnabled, selectedModuleId,
  computedFloorOffset, canvasRef, threeRef, cameraAnimRef,
  updatePersisted, deleteSelectedModule,
  onPointerDown, onPointerMove, onPointerUp,
}: ParametricPreview3DProps) {

  const animateCamera = useCallback((view: typeof CAMERA_VIEWS[number]) => {
    if (!threeRef.current) return;
    const { camera, controls } = threeRef.current;
    const maxDim = Math.max(module.width, module.height, module.depth) * 0.01;
    const dist = Math.max(maxDim * 2.2, 4);
    const centerY = (computedFloorOffset * 0.01) + (module.height * 0.01) / 2;
    const endPos: [number, number, number] = [
      view.pos[0] * dist,
      view.pos[1] * dist + (view.label === "Planta" ? dist : 0),
      view.pos[2] * dist,
    ];
    const endTarget: [number, number, number] = [
      view.target[0],
      view.label === "Planta" ? 0 : centerY,
      view.target[2] * maxDim * 0.3,
    ];
    cameraAnimRef.current = {
      startPos: [camera.position.x, camera.position.y, camera.position.z],
      endPos,
      startTarget: [controls.target.x, controls.target.y, controls.target.z],
      endTarget,
      progress: 0,
      active: true,
    };
  }, [module, computedFloorOffset, threeRef, cameraAnimRef]);

  const exportPNG = useCallback(() => {
    if (!threeRef.current) return;
    const { renderer, scene, camera } = threeRef.current;
    const origW = renderer.domElement.width;
    const origH = renderer.domElement.height;
    renderer.setSize(origW * 2, origH * 2);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    renderer.setSize(origW, origH);
    renderer.render(scene, camera);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#333333";
      ctx.font = `bold ${Math.max(16, canvas.height * 0.025)}px Arial`;
      ctx.textAlign = "right";
      ctx.fillText(`OrçaMóvel Pro • ${module.name}`, canvas.width - 20, canvas.height - 20);
      ctx.fillText(`${module.width}×${module.height}×${module.depth}mm`, canvas.width - 20, canvas.height - 45);
      ctx.globalAlpha = 1;
      const link = document.createElement("a");
      link.download = `Projeto_3D_${module.name.replace(/\s+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Imagem PNG exportada em alta resolução!");
    };
    img.src = dataUrl;
  }, [module, threeRef]);

  const exportPDFVistas = useCallback(async () => {
    if (!threeRef.current) return;
    const { renderer, scene, camera, controls } = threeRef.current;
    const maxDim = Math.max(module.width, module.height, module.depth) * 0.01;
    const dist = Math.max(maxDim * 2.2, 4);
    const centerY = (computedFloorOffset * 0.01) + (module.height * 0.01) / 2;
    const views = [
      { label: "Frontal", pos: [0, 0.5, 1], target: [0, 0.5, 0] },
      { label: "Traseira", pos: [0, 0.5, -1], target: [0, 0.5, 0] },
      { label: "Esquerda", pos: [-1, 0.5, 0], target: [0, 0.5, 0] },
      { label: "Direita", pos: [1, 0.5, 0], target: [0, 0.5, 0] },
      { label: "Planta", pos: [0, 1, 0.01], target: [0, 0, 0] },
      { label: "Perspectiva", pos: [1, 0.7, 1], target: [0, 0.3, 0] },
    ];
    const origW = renderer.domElement.width;
    const origH = renderer.domElement.height;
    const snapW = 1200;
    const snapH = 900;
    const snapshots: { label: string; dataUrl: string }[] = [];
    const origPos = camera.position.clone();
    const origTarget = controls.target.clone();
    camera.aspect = snapW / snapH;
    camera.updateProjectionMatrix();
    renderer.setSize(snapW, snapH);
    for (const v of views) {
      camera.position.set(
        v.pos[0] * dist,
        v.pos[1] * dist + (v.label === "Planta" ? dist : 0),
        v.pos[2] * dist
      );
      controls.target.set(v.target[0], v.label === "Planta" ? 0 : centerY, v.target[2] * maxDim * 0.3);
      controls.update();
      renderer.render(scene, camera);
      snapshots.push({ label: v.label, dataUrl: renderer.domElement.toDataURL("image/jpeg", 0.92) });
    }
    camera.position.copy(origPos);
    controls.target.copy(origTarget);
    camera.aspect = origW / origH;
    camera.updateProjectionMatrix();
    renderer.setSize(origW, origH);
    controls.update();
    renderer.render(scene, camera);
    const { default: jsPDFLib } = await import("jspdf");
    const pdf = new jsPDFLib({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    pdf.setFontSize(22);
    pdf.setFont("helvetica", "bold");
    pdf.text("PROPOSTA COMERCIAL — VISTAS 3D", pw / 2, 40, { align: "center" });
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Projeto: ${module.name}`, pw / 2, 55, { align: "center" });
    pdf.text(`Dimensões: ${module.width}×${module.height}×${module.depth}mm`, pw / 2, 63, { align: "center" });
    pdf.text(new Date().toLocaleDateString("pt-BR"), pw / 2, 71, { align: "center" });
    for (const snap of snapshots) {
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Vista: ${snap.label}`, 15, 15);
      const imgW = pw - 30;
      const imgH = imgW * (snapH / snapW);
      const yOff = Math.max(20, (ph - imgH) / 2);
      pdf.addImage(snap.dataUrl, "JPEG", 15, yOff, imgW, imgH);
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(150);
      pdf.text("OrçaMóvel Pro — Proposta gerada automaticamente", pw / 2, ph - 8, { align: "center" });
      pdf.setTextColor(0);
    }
    pdf.save(`Proposta_Vistas_${module.name.replace(/\s+/g, "_")}.pdf`);
    toast.success("PDF multi-ângulo exportado com sucesso!");
  }, [module, computedFloorOffset, threeRef]);

  const doorCount = module.components.filter((c) => c.type === "porta").length;
  const drawerCount = module.components.filter((c) => c.type === "gaveta").length;

  return (
    <Card className="flex-1 relative overflow-hidden min-h-[350px]">
      <CardContent className="p-0 absolute inset-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ minHeight: 350, cursor: lockPosition ? "default" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {/* Camera preset views */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {CAMERA_VIEWS.map((view) => (
            <Button
              key={view.label}
              variant="outline"
              size="sm"
              className="h-6 text-[9px] px-1.5 gap-0.5 bg-background/80 backdrop-blur-sm w-[70px] justify-start"
              title={view.label}
              onClick={() => animateCamera(view)}
            >
              <span className="font-bold text-[9px] w-4 text-center">{view.icon}</span>
              <span className="truncate">{view.label}</span>
            </Button>
          ))}
        </div>
        {/* Module controls: lock, group, delete */}
        <div className="absolute bottom-2 right-2 flex gap-1 z-10">
          <Button
            variant={lockPosition ? "default" : "outline"}
            size="sm"
            className="h-7 text-[9px] px-2 gap-1 bg-background/80 backdrop-blur-sm"
            onClick={() => updatePersisted({ lockPosition: !lockPosition })}
            title={lockPosition ? "Desbloquear arraste" : "Travar posição"}
          >
            {lockPosition ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {lockPosition ? "Travado" : "Livre"}
          </Button>
          <Button
            variant={groupSelect ? "default" : "outline"}
            size="sm"
            className="h-7 text-[9px] px-2 gap-1 bg-background/80 backdrop-blur-sm"
            onClick={() => updatePersisted({ groupSelect: !groupSelect })}
            title={groupSelect ? "Mover individualmente" : "Mover todos juntos"}
            disabled={duplicates.length === 0}
          >
            <Group className="h-3 w-3" />
            {groupSelect ? "Grupo" : "Individual"}
          </Button>
          <Button
            variant={collisionEnabled ? "default" : "outline"}
            size="sm"
            className="h-7 text-[9px] px-2 gap-1 bg-background/80 backdrop-blur-sm"
            onClick={() => updatePersisted({ collisionEnabled: !collisionEnabled })}
            title={collisionEnabled ? "Desativar colisão" : "Ativar colisão"}
          >
            {collisionEnabled ? <Shield className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
            {collisionEnabled ? "Colisão" : "Livre"}
          </Button>
          {selectedModuleId && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-[9px] px-2 gap-1"
              onClick={deleteSelectedModule}
              title="Excluir módulo selecionado"
            >
              <Trash2 className="h-3 w-3" /> Excluir
            </Button>
          )}
          {selectedModuleId && (
            <Badge variant="secondary" className="text-[9px] h-7 flex items-center">
              <MousePointer className="h-3 w-3 mr-1" />
              {selectedModuleId === "__main__" ? module.name : duplicates.find((d) => d.id === selectedModuleId)?.module.name || ""}
            </Badge>
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-1.5 flex-wrap justify-end max-w-[65%]">
          <Button
            variant={showCotas ? "default" : "outline"}
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={() => updatePersisted({ showCotas: !showCotas })}
          >
            {showCotas ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Cotas
          </Button>
          {doorCount > 0 && (
            <Button
              variant={openDoors ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2 gap-1"
              onClick={() => updatePersisted({ openDoors: !openDoors })}
            >
              {openDoors ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              Portas
            </Button>
          )}
          {drawerCount > 0 && (
            <Button
              variant={openDrawers ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2 gap-1"
              onClick={() => updatePersisted({ openDrawers: !openDrawers })}
            >
              {openDrawers ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              Gavetas
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={exportPNG}
          >
            <Camera className="h-3 w-3" /> PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={exportPDFVistas}
          >
            <FileDown className="h-3 w-3" /> PDF Vistas
          </Button>
          <Badge variant="secondary" className="text-[10px]">
            {module.width}×{module.height}×{module.depth}mm
          </Badge>
          {computedFloorOffset > 0 && (
            <Badge variant="outline" className="text-[10px]">
              Piso: {computedFloorOffset}mm
            </Badge>
          )}
          {module.moduleType !== "custom" && (
            <Badge className="text-[10px]">
              {MODULE_PRESETS.find((p) => p.type === module.moduleType)?.label}
            </Badge>
          )}
          {wall.enabled && (
            <Badge variant="outline" className="text-[10px]">
              Parede {wall.width}×{wall.height}mm
            </Badge>
          )}
          {duplicates.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              +{duplicates.length} cópia{duplicates.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {/* Cota color legend */}
        {showCotas && (
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm rounded-lg border border-border p-2 space-y-0.5 z-10">
            <p className="text-[9px] font-semibold text-foreground mb-1">Legenda das Cotas</p>
            {COTA_LEGEND.map((item) => (
              <div key={item.color} className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: item.hex }} />
                <span className="text-[8px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
