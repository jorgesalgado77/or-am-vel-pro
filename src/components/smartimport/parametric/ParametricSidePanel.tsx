/**
 * ParametricSidePanel — Sidebar panel extracted from ParametricEditor.
 * Contains all module configuration controls: presets, dimensions, wall, components,
 * colors/textures, duplicates, library, and action buttons.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Minus, Layers, RulerIcon, Save, RotateCcw,
  Package, Palette, LayoutTemplate, Copy, Square,
  Upload, ImageIcon, FolderOpen, BookOpen, FileDown,
} from "lucide-react";
import type {
  ParametricModule, InternalComponent, ComponentType, ModuleType, SpanResult, ModuleBOM,
} from "@/types/parametricModule";
import { MODULE_PRESETS, SHEET_THICKNESSES, BACK_THICKNESSES } from "@/types/parametricModule";
import { redistributeShelves } from "@/lib/spanEngine";
import type { CatalogItem } from "@/hooks/useModuleCatalog";
import type { CategoryTreeNode } from "@/hooks/useModuleCategories";

const SHELF_THICKNESSES = [15, 18, 25, 36] as const;
const DOOR_THICKNESSES = [15, 18] as const;
const MAX_DRAWERS = 4;

const WALL_COLOR_OPTIONS = [
  { label: "Padrão", value: "#e8e0d8" },
  { label: "Preta", value: "#1a1a1a" },
  { label: "Cinza Claro", value: "#d4d4d4" },
  { label: "Cinza Escuro", value: "#525252" },
];

const FURNITURE_COLOR_OPTIONS = [
  { label: "Madeira Clara", value: "#d4a574" },
  { label: "Madeira Escura", value: "#8b6914" },
  { label: "Branco", value: "#fafafa" },
  { label: "Preto", value: "#1a1a1a" },
  { label: "Cinza", value: "#9ca3af" },
  { label: "Carvalho", value: "#c4a060" },
  { label: "Tabaco", value: "#6b4226" },
  { label: "Wengue", value: "#3c2415" },
];

interface FurnitureColors {
  body: string;
  door: string;
  shelf: string;
  back: string;
  drawer: string;
}

interface WallConfig {
  enabled: boolean;
  width: number;
  height: number;
  depth: number;
  color: string;
}

interface TextureSlots {
  body?: string;
  door?: string;
  shelf?: string;
  back?: string;
  drawer?: string;
  wall?: string;
  floor?: string;
}

interface DuplicatedModule {
  id: string;
  module: ParametricModule;
  positionX: number;
  positionZ: number;
}

export interface ParametricSidePanelProps {
  module: ParametricModule;
  setModule: (updater: ParametricModule | ((prev: ParametricModule) => ParametricModule)) => void;
  spans: SpanResult;
  bom: ModuleBOM;
  wall: WallConfig;
  setWall: (w: Partial<WallConfig>) => void;
  furnitureColors: FurnitureColors;
  setFurnitureColor: (key: keyof FurnitureColors, value: string) => void;
  textureSlots: TextureSlots;
  handleTextureUpload: (slot: keyof TextureSlots, file: File) => void;
  removeTexture: (slot: keyof TextureSlots) => void;
  duplicates: DuplicatedModule[];
  duplicateModule: () => void;
  removeDuplicate: (id: string) => void;
  updatePersisted: (partial: Record<string, unknown>) => void;
  floorHeightInferior: number;
  floorHeightSuperior: number;
  floorColor: string;
  moduleOffsetX: number;
  moduleOffsetY: number;
  computedFloorOffset: number;
  savedModules: Array<{ id: string; name: string; parametric_data: unknown }>;
  loadModuleFromLibrary: (saved: { id: string; name: string; parametric_data: unknown }) => void;
  flatCategories: Array<{ id: string; name: string; depth: number; parentId: string | null }>;
  materiais: CatalogItem[];
  onSave: () => void;
  onReset: () => void;
  onSaveLibrary: () => void;
  onExportPdf: () => void;
  saveLibName: string;
  setSaveLibName: (v: string) => void;
}

export function ParametricSidePanel({
  module, setModule, spans, bom, wall, setWall,
  furnitureColors, setFurnitureColor, textureSlots, handleTextureUpload, removeTexture,
  duplicates, duplicateModule, removeDuplicate, updatePersisted,
  floorHeightInferior, floorHeightSuperior, floorColor,
  moduleOffsetX, moduleOffsetY, computedFloorOffset,
  savedModules, loadModuleFromLibrary, flatCategories, materiais,
  onSave, onReset, onSaveLibrary, onExportPdf,
}: ParametricSidePanelProps) {

  const shelfCount = module.components.filter((c) => c.type === "prateleira").length;
  const doorCount = module.components.filter((c) => c.type === "porta").length;
  const drawerCount = module.components.filter((c) => c.type === "gaveta").length;
  const dividerCount = module.components.filter((c) => c.type === "divisoria").length;

  const applyPreset = (presetType: ModuleType) => {
    if (presetType === "custom") return;
    const preset = MODULE_PRESETS.find((p) => p.type === presetType);
    if (!preset) return;
    setModule((prev) => ({
      ...prev,
      name: preset.label,
      moduleType: preset.type,
      width: preset.width,
      height: preset.height,
      depth: preset.depth,
      thickness: preset.thickness,
      backThickness: preset.backThickness,
      baseboardHeight: preset.baseboardHeight,
      components: [],
      slots: [],
      verticalDivisions: 0,
    }));
    updatePersisted({ moduleOffsetX: 0, moduleOffsetY: 0 });
  };

  const updateDimension = (key: "width" | "height" | "depth", value: number) => {
    const clamped = Math.max(60, Math.min(2700, value));
    setModule((prev) => {
      const updated = { ...prev, [key]: clamped, moduleType: "custom" as ModuleType };
      return { ...updated, components: redistributeShelves(updated) };
    });
  };

  const addComponent = (type: ComponentType) => {
    setModule((prev) => {
      const baseY = prev.thickness + (prev.baseboardHeight || 0);
      const ih = prev.height - prev.thickness * 2 - (prev.baseboardHeight || 0);
      const comp: InternalComponent = {
        id: crypto.randomUUID(),
        type,
        positionY: type === "divisoria" ? prev.width / 2 : baseY + ih / 2,
        thickness: type === "gaveta" ? 18 : prev.thickness,
        frontHeight: type === "gaveta" ? 180 : undefined,
        bottomThickness: type === "gaveta" ? 3 : undefined,
      };
      const updated = { ...prev, components: [...prev.components, comp] };
      if (type === "prateleira" || type === "divisoria" || type === "gaveta") {
        return { ...updated, components: redistributeShelves(updated) };
      }
      return updated;
    });
  };

  const removeComponent = (id: string) => {
    setModule((prev) => {
      const updated = { ...prev, components: prev.components.filter((c) => c.id !== id) };
      return { ...updated, components: redistributeShelves(updated) };
    });
  };

  return (
    <div className="w-full md:w-[360px] shrink-0 overflow-y-auto space-y-3 pr-1">
      {/* Preset Selector */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <LayoutTemplate className="h-3.5 w-3.5 text-primary" /> Tipo de Módulo
          </h4>
          <Select
            value={module.moduleType}
            onValueChange={(v) => applyPreset(v as ModuleType)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar módulo..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Personalizado</SelectItem>
              {MODULE_PRESETS.map((p) => (
                <SelectItem key={p.type} value={p.type}>
                  <div className="flex flex-col">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-[10px] text-muted-foreground">{p.description} — {p.width}×{p.height}×{p.depth}mm</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {module.moduleType !== "custom" && (
            <Badge variant="outline" className="text-[10px]">
              {MODULE_PRESETS.find((p) => p.type === module.moduleType)?.label}
              {module.baseboardHeight > 0 && ` • Rodapé ${module.baseboardHeight}mm`}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Nome */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <Label className="text-xs font-medium">Nome do Módulo</Label>
          <Input
            value={module.name}
            onChange={(e) => setModule((p) => ({ ...p, name: e.target.value }))}
            className="h-8 text-sm"
          />
        </CardContent>
      </Card>

      {/* Dimensões */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <RulerIcon className="h-3.5 w-3.5 text-primary" /> Dimensões (mm)
          </h4>

          {[
            { label: "Largura (L)", key: "width" as const, min: 60, max: 2700 },
            { label: "Altura (A)", key: "height" as const, min: 60, max: 2700 },
            { label: "Profundidade (P)", key: "depth" as const, min: 60, max: 2700 },
          ].map(({ label, key, min, max }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] whitespace-nowrap">{label}</Label>
                <Input
                  type="number"
                  defaultValue={module[key]}
                  key={`${key}-${module.id}-${module.moduleType}`}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v) && v >= min && v <= max) {
                      updateDimension(key, v);
                    } else {
                      e.target.value = String(module[key]);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="h-6 w-20 text-[11px] text-right font-mono"
                  min={min}
                  max={max}
                />
              </div>
              <Slider
                value={[module[key]]}
                min={min}
                max={max}
                step={1}
                onValueChange={([v]) => updateDimension(key, v)}
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Espessura Chapa</Label>
              <Select
                value={String(module.thickness)}
                onValueChange={(v) => {
                  const t = Number(v);
                  setModule((p) => {
                    const updated = { ...p, thickness: t, moduleType: "custom" as ModuleType };
                    updated.components = updated.components.map((c) =>
                      c.type === "prateleira" || c.type === "divisoria"
                        ? { ...c, thickness: t }
                        : c
                    );
                    return { ...updated, components: redistributeShelves(updated) };
                  });
                }}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHEET_THICKNESSES.map((t) => (
                    <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Espessura Fundo</Label>
              <Select
                value={String(module.backThickness)}
                onValueChange={(v) => setModule((p) => ({ ...p, backThickness: Number(v) }))}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BACK_THICKNESSES.map((t) => (
                    <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rodapé */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Rodapé (mm)</Label>
              <Input
                type="number"
                value={module.baseboardHeight}
                onChange={(e) => setModule((p) => {
                  const updated = { ...p, baseboardHeight: Math.max(0, Number(e.target.value)) };
                  return { ...updated, components: redistributeShelves(updated) };
                })}
                className="h-6 w-20 text-[11px] text-right font-mono"
                min={0}
                max={200}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parede */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Square className="h-3.5 w-3.5 text-primary" /> Parede
            </h4>
            <Button
              variant={wall.enabled ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setWall({ enabled: !wall.enabled })}
            >
              {wall.enabled ? "Ativa" : "Inativa"}
            </Button>
          </div>
          {wall.enabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: "Largura", key: "width" as const },
                  { label: "Altura", key: "height" as const },
                  { label: "Profund.", key: "depth" as const },
                ] as const).map(({ label, key }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[10px]">{label} (mm)</Label>
                    <Input
                      type="number"
                      value={wall[key]}
                      onChange={(e) => setWall({ [key]: Number(e.target.value) })}
                      className="h-6 text-[10px] font-mono"
                    />
                  </div>
                ))}
              </div>
              {/* Wall Color */}
              <div className="space-y-1">
                <Label className="text-[10px]">Cor da Parede</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {WALL_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setWall({ color: opt.value })}
                      className={`w-7 h-7 rounded-md border-2 transition-all ${
                        wall.color === opt.value ? "border-primary ring-2 ring-primary/30" : "border-border"
                      }`}
                      style={{ backgroundColor: opt.value }}
                      title={opt.label}
                    />
                  ))}
                  <input
                    type="color"
                    value={wall.color || "#e8e0d8"}
                    onChange={(e) => setWall({ color: e.target.value })}
                    className="w-7 h-7 rounded-md border border-border cursor-pointer"
                    title="Cor personalizada"
                  />
                </div>
              </div>
              {/* Wall Texture */}
              <div className="space-y-1">
                <Label className="text-[10px] flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> Textura da Parede
                </Label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border cursor-pointer text-[10px] hover:bg-muted transition-colors">
                    <Upload className="h-3 w-3" /> Enviar
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleTextureUpload("wall", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {textureSlots.wall && (
                    <div className="flex items-center gap-1">
                      <img src={textureSlots.wall} className="h-7 w-7 rounded border border-border object-cover" alt="wall texture" />
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeTexture("wall")}>
                        <Minus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {/* Floor Height Offsets */}
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-[10px] font-semibold text-muted-foreground">Altura do Piso (mm)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[9px]">Inferior Cozinha</Label>
                    <Input
                      type="number"
                      value={floorHeightInferior}
                      onChange={(e) => updatePersisted({ floorHeightInferior: Math.max(0, Number(e.target.value)) })}
                      className="h-6 text-[10px] font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px]">Superior Cozinha</Label>
                    <Input
                      type="number"
                      value={floorHeightSuperior}
                      onChange={(e) => updatePersisted({ floorHeightSuperior: Math.max(0, Number(e.target.value)) })}
                      className="h-6 text-[10px] font-mono"
                    />
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  Dormitório, bancadas e outros: 0mm do piso
                </p>
              </div>

              {/* Cotas de Posicionamento */}
              {wall.enabled && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    <RulerIcon className="h-3 w-3" /> Cotas de Posicionamento (mm)
                  </Label>
                  {(() => {
                    const halfWall = wall.width / 2;
                    const halfMod = module.width / 2;
                    const cotaEsquerda = Math.round(halfWall + moduleOffsetX - halfMod);
                    const cotaDireita = Math.round(halfWall - moduleOffsetX - halfMod);
                    const cotaPiso = Math.round(computedFloorOffset + moduleOffsetY);
                    const cotaSuperior = Math.round(wall.height - module.height - computedFloorOffset - moduleOffsetY);

                    const handleCotaEsquerda = (val: number) => {
                      const newX = val - halfWall + halfMod;
                      const maxX = halfWall - halfMod;
                      updatePersisted({ moduleOffsetX: Math.max(-maxX, Math.min(maxX, newX)) });
                    };
                    const handleCotaDireita = (val: number) => {
                      const newX = halfWall - halfMod - val;
                      const maxX = halfWall - halfMod;
                      updatePersisted({ moduleOffsetX: Math.max(-maxX, Math.min(maxX, newX)) });
                    };
                    const handleCotaSuperior = (val: number) => {
                      const newY = wall.height - module.height - computedFloorOffset - val;
                      const maxY = wall.height - module.height - computedFloorOffset;
                      updatePersisted({ moduleOffsetY: Math.max(0, Math.min(maxY, newY)) });
                    };
                    const handleCotaPiso = (val: number) => {
                      const newY = val - computedFloorOffset;
                      const maxY = wall.height - module.height - computedFloorOffset;
                      updatePersisted({ moduleOffsetY: Math.max(0, Math.min(maxY, newY)) });
                    };

                    return (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[9px]">← Esquerda</Label>
                          <Input
                            type="number"
                            key={`ce-${cotaEsquerda}`}
                            defaultValue={Math.max(0, cotaEsquerda)}
                            onBlur={(e) => handleCotaEsquerda(Math.max(0, Number(e.target.value)))}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-6 text-[10px] font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[9px]">Direita →</Label>
                          <Input
                            type="number"
                            key={`cd-${cotaDireita}`}
                            defaultValue={Math.max(0, cotaDireita)}
                            onBlur={(e) => handleCotaDireita(Math.max(0, Number(e.target.value)))}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-6 text-[10px] font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[9px]">↓ Piso (total)</Label>
                          <Input
                            type="number"
                            key={`cp-${cotaPiso}`}
                            defaultValue={Math.max(0, cotaPiso)}
                            onBlur={(e) => handleCotaPiso(Math.max(0, Number(e.target.value)))}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-6 text-[10px] font-mono bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[9px]">↑ Superior</Label>
                          <Input
                            type="number"
                            key={`cs-${cotaSuperior}`}
                            defaultValue={Math.max(0, cotaSuperior)}
                            onBlur={(e) => handleCotaSuperior(Math.max(0, Number(e.target.value)))}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-6 text-[10px] font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-[8px] text-muted-foreground italic">
                    Valores sincronizam com arraste 3D e cotas visuais
                  </p>
                </div>
              )}

              {/* Floor color & texture */}
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Square className="h-3 w-3" /> Piso
                </Label>
                <div className="flex gap-1 flex-wrap">
                  {[
                    { label: "Cinza Claro", value: "#d6d3cd" },
                    { label: "Branco", value: "#f0ede8" },
                    { label: "Madeira", value: "#c4a060" },
                    { label: "Escuro", value: "#555555" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`w-7 h-7 rounded border-2 transition-all ${floorColor === opt.value ? "border-primary scale-110" : "border-border"}`}
                      style={{ backgroundColor: opt.value }}
                      onClick={() => updatePersisted({ floorColor: opt.value })}
                      title={opt.label}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border cursor-pointer text-[10px] hover:bg-muted transition-colors">
                    <Upload className="h-3 w-3" /> Textura Piso
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleTextureUpload("floor", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {textureSlots.floor && (
                    <div className="flex items-center gap-1">
                      <img src={textureSlots.floor} className="h-7 w-7 rounded border border-border object-cover" alt="floor texture" />
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeTexture("floor")}>
                        <Minus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Componentes Internos */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" /> Componentes Internos
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {([
              { type: "prateleira" as ComponentType, label: "Prateleira", count: shelfCount },
              { type: "porta" as ComponentType, label: "Porta", count: doorCount },
              { type: "gaveta" as ComponentType, label: "Gaveta", count: drawerCount },
              { type: "divisoria" as ComponentType, label: "Divisória", count: dividerCount },
            ]).map(({ type, label, count }) => (
              <div key={type} className="flex items-center justify-between bg-muted/50 rounded-md px-2 py-1.5">
                <span className="text-[11px] font-medium text-foreground">{label}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => {
                      const comps = module.components.filter((c) => c.type === type);
                      if (comps.length > 0) removeComponent(comps[comps.length - 1].id);
                    }}
                    disabled={count === 0}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Badge variant="secondary" className="text-[10px] min-w-[20px] text-center">{count}</Badge>
                  <Button variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => addComponent(type)}
                    disabled={type === "gaveta" && count >= MAX_DRAWERS}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {module.components.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border">
              <Label className="text-[10px] text-muted-foreground">Espessura por componente</Label>
              {module.components.map((comp, idx) => {
                const isShelfOrDiv = comp.type === "prateleira" || comp.type === "divisoria";
                const isDoorOrFront = comp.type === "porta" || comp.type === "gaveta";
                const thicknessOptions = isShelfOrDiv ? SHELF_THICKNESSES : isDoorOrFront ? DOOR_THICKNESSES : SHELF_THICKNESSES;
                const typeLabel = comp.type === "prateleira" ? "Prat." : comp.type === "porta" ? "Porta" : comp.type === "gaveta" ? "Gaveta" : comp.type === "divisoria" ? "Div." : comp.type;
                return (
                  <div key={comp.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] text-foreground truncate w-16">{typeLabel} {idx + 1}</span>
                      <Select
                        value={String(comp.thickness)}
                        onValueChange={(v) => {
                          setModule((p) => {
                            const comps = p.components.map((c) =>
                              c.id === comp.id ? { ...c, thickness: Number(v) } : c
                            );
                            const updated = { ...p, components: comps };
                            return comp.type === "prateleira" || comp.type === "divisoria" || comp.type === "gaveta"
                              ? { ...updated, components: redistributeShelves(updated) }
                              : updated;
                          });
                        }}
                      >
                        <SelectTrigger className="h-5 w-20 text-[9px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {thicknessOptions.map((t) => (
                            <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {comp.type === "gaveta" && (
                      <>
                        <div className="flex items-center justify-between gap-1 pl-2">
                          <span className="text-[9px] text-muted-foreground truncate w-16">Frente Alt.</span>
                          <Input
                            type="number"
                            className="h-5 w-20 text-[9px] px-1"
                            value={comp.manualFrontHeight ?? comp.frontHeight ?? ""}
                            placeholder="Auto"
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : undefined;
                              setModule((p) => {
                                const comps = p.components.map((c) =>
                                  c.id === comp.id ? { ...c, manualFrontHeight: val } : c
                                );
                                const updated = { ...p, components: comps };
                                return { ...updated, components: redistributeShelves(updated) };
                              });
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1 pl-2">
                          <span className="text-[9px] text-muted-foreground truncate w-16">Fundo</span>
                          <Select
                            value={String(comp.bottomThickness ?? 3)}
                            onValueChange={(v) => {
                              setModule((p) => ({
                                ...p,
                                components: p.components.map((c) =>
                                  c.id === comp.id ? { ...c, bottomThickness: Number(v) } : c
                                ),
                              }));
                            }}
                          >
                            <SelectTrigger className="h-5 w-20 text-[9px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[3, 6, 15].map((t) => (
                                <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vãos Calculados */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <RulerIcon className="h-3.5 w-3.5 text-primary" /> Vãos Internos
          </h4>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">Vão Interno (A)</span>
              <p className="font-mono font-semibold">{spans.vaoInterno}mm</p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">Largura Interna</span>
              <p className="font-mono font-semibold">{spans.larguraInterna}mm</p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">Vão Livre</span>
              <p className="font-mono font-semibold">{spans.vaoLivre.toFixed(0)}mm</p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">Vão Unitário</span>
              <p className="font-mono font-semibold">{spans.vaoUnitario}mm</p>
            </div>
            <div className="bg-muted/50 rounded p-2 col-span-2">
              <span className="text-muted-foreground">Qtd. Vãos</span>
              <p className="font-mono font-semibold">{spans.quantidadeVaos}</p>
            </div>
          </div>
          {module.baseboardHeight > 0 && (
            <p className="text-[10px] text-muted-foreground">
              * Rodapé de {module.baseboardHeight}mm descontado do vão interno
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cores e Materiais */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-primary" /> Cores e Texturas do Móvel
          </h4>
          <div className="space-y-2.5">
            {([
              { key: "body" as const, label: "Caixa (corpo)" },
              { key: "door" as const, label: "Portas / Frentes" },
              { key: "shelf" as const, label: "Prateleiras" },
              { key: "back" as const, label: "Fundo" },
              { key: "drawer" as const, label: "Corpo Gavetas" },
            ]).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-[10px] font-medium">{label}</Label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {FURNITURE_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFurnitureColor(key, opt.value)}
                      className={`w-5 h-5 rounded border transition-all ${
                        furnitureColors[key] === opt.value ? "border-primary ring-1 ring-primary/30 scale-110" : "border-border"
                      }`}
                      style={{ backgroundColor: opt.value }}
                      title={opt.label}
                    />
                  ))}
                  <input
                    type="color"
                    value={furnitureColors[key]}
                    onChange={(e) => setFurnitureColor(key, e.target.value)}
                    className="w-5 h-5 rounded border border-border cursor-pointer"
                    title="Cor personalizada"
                  />
                  <label className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/50 border border-border cursor-pointer text-[9px] hover:bg-muted transition-colors">
                    <Upload className="h-2.5 w-2.5" /> Textura
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleTextureUpload(key, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {textureSlots[key] && (
                    <div className="flex items-center gap-0.5">
                      <img src={textureSlots[key]} className="h-5 w-5 rounded border border-border object-cover" alt={`${key} texture`} />
                      <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeTexture(key)}>
                        <Minus className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Catalog materials */}
          {materiais.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border">
              <Label className="text-[11px]">Material do Catálogo</Label>
              <Select
                value={module.bodyMaterialId || ""}
                onValueChange={(v) => setModule((p) => ({ ...p, bodyMaterialId: v || undefined }))}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar material..." /></SelectTrigger>
                <SelectContent>
                  {materiais.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} {m.cost ? `(R$ ${m.cost.toFixed(2)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duplicação */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5 text-primary" /> Módulos Duplicados ({duplicates.length})
            </h4>
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2" onClick={duplicateModule}>
              <Plus className="h-3 w-3" /> Duplicar
            </Button>
          </div>
          {duplicates.length > 0 && (
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
              {duplicates.map((dup) => (
                <div key={dup.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                  <span className="text-[10px] font-medium truncate">{dup.module.name}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={dup.positionX}
                      onChange={(e) => {
                        const newDups = duplicates.map((d) =>
                          d.id === dup.id ? { ...d, positionX: Number(e.target.value) } : d
                        );
                        updatePersisted({ duplicates: newDups });
                      }}
                      className="h-5 w-16 text-[9px] font-mono"
                      title="Posição X (mm)"
                    />
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                      onClick={() => removeDuplicate(dup.id)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Biblioteca Salva */}
      {savedModules.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" /> Módulos da Biblioteca
            </h4>
            <div className="space-y-1 max-h-[100px] overflow-y-auto">
              {savedModules.map((sm) => (
                <button
                  key={sm.id}
                  onClick={() => loadModuleFromLibrary(sm)}
                  className="w-full flex items-center justify-between bg-muted/50 rounded px-2 py-1 hover:bg-muted transition-colors text-left"
                >
                  <span className="text-[10px] font-medium text-foreground truncate">{sm.name}</span>
                  <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="flex-1 gap-1.5" onClick={onSave}>
          <Save className="h-3.5 w-3.5" /> Salvar
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={onSaveLibrary}>
          <FolderOpen className="h-3.5 w-3.5" /> Biblioteca
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onExportPdf}>
          <FileDown className="h-3.5 w-3.5" /> PDF
        </Button>
        <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
