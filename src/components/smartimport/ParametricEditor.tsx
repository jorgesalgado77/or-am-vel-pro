import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Minus, Layers, Box, RulerIcon, Wrench, Save, RotateCcw,
  PanelLeftClose, PanelLeft, Eye, Package, Palette,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type {
  ParametricModule, InternalComponent, ComponentType, DEFAULT_MODULE, ModuleBOM,
} from "@/types/parametricModule";
import { calculateInternalSpans, generateBOM, redistributeShelves, snapToGrid } from "@/lib/spanEngine";
import { generateParametricGeometry } from "@/lib/parametricGeometry";
import type { CatalogItem } from "@/hooks/useModuleCatalog";

interface ParametricEditorProps {
  onSave?: (module: ParametricModule) => void;
  initialModule?: ParametricModule | null;
  tenantId?: string | null;
  catalogItems?: CatalogItem[];
}

function createDefaultModule(): ParametricModule {
  return {
    id: crypto.randomUUID(),
    name: "Novo Módulo",
    width: 600,
    height: 720,
    depth: 500,
    thickness: 18,
    backThickness: 6,
    verticalDivisions: 0,
    components: [],
    slots: [],
  };
}

export function ParametricEditor({ onSave, initialModule, tenantId, catalogItems = [] }: ParametricEditorProps) {
  const [module, setModule] = useState<ParametricModule>(initialModule || createDefaultModule);
  const [showPanel, setShowPanel] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<any>(null);
  const needsRenderRef = useRef(true);
  const animFrameRef = useRef(0);

  // Computed values
  const spans = useMemo(() => calculateInternalSpans(module), [module]);
  const bom = useMemo(() => generateBOM(module), [module]);

  // Catalog items by category
  const cores = useMemo(() => catalogItems.filter((i) => i.category === "cor"), [catalogItems]);
  const materiais = useMemo(() => catalogItems.filter((i) => i.category === "material" || i.category === "acabamento"), [catalogItems]);

  // Material state
  const [corCaixa, setCorCaixa] = useState("");
  const [corPorta, setCorPorta] = useState("");

  // ── 3D Preview ──
  useEffect(() => {
    let mounted = true;
    let renderer: any = null;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

      if (!mounted || !canvasRef.current) return;

      const container = canvasRef.current.parentElement!;
      const w = container.clientWidth;
      const h = container.clientHeight;

      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1e293b);

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
      camera.position.set(5, 4, 5);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 1;
      controls.maxDistance = 20;
      controls.addEventListener("change", () => { needsRenderRef.current = true; });

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dl = new THREE.DirectionalLight(0xffffff, 1.2);
      dl.position.set(5, 8, 5);
      scene.add(dl);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));

      // Grid
      const grid = new THREE.GridHelper(20, 20, 0x334155, 0x334155);
      (grid.material as any).opacity = 0.4;
      (grid.material as any).transparent = true;
      scene.add(grid);

      threeRef.current = { THREE, scene, renderer, camera, controls, moduleGroup: null };
      needsRenderRef.current = true;

      renderer.domElement.style.touchAction = "none";

      const animate = () => {
        if (!mounted) return;
        animFrameRef.current = requestAnimationFrame(animate);
        controls.update();
        if (needsRenderRef.current) {
          renderer.render(scene, camera);
          needsRenderRef.current = false;
        }
      };
      animate();

      const onResize = () => {
        if (!canvasRef.current) return;
        const c = canvasRef.current.parentElement!;
        camera.aspect = c.clientWidth / c.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(c.clientWidth, c.clientHeight);
        needsRenderRef.current = true;
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
      };
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);
      renderer?.dispose?.();
    };
  }, []);

  // ── Rebuild geometry when module changes ──
  useEffect(() => {
    if (!threeRef.current) return;
    const { THREE, scene } = threeRef.current;

    // Remove old
    if (threeRef.current.moduleGroup) {
      scene.remove(threeRef.current.moduleGroup);
    }

    const grp = generateParametricGeometry(THREE, module);
    scene.add(grp);
    threeRef.current.moduleGroup = grp;
    needsRenderRef.current = true;
  }, [module]);

  // ── Module update helpers ──
  const updateDimension = useCallback((key: "width" | "height" | "depth", value: number) => {
    setModule((prev) => {
      const updated = { ...prev, [key]: snapToGrid(value) };
      return { ...updated, components: redistributeShelves(updated) };
    });
  }, []);

  const addComponent = useCallback((type: ComponentType) => {
    setModule((prev) => {
      const ih = prev.height - prev.thickness * 2;
      const comp: InternalComponent = {
        id: crypto.randomUUID(),
        type,
        positionY: type === "divisoria" ? prev.width / 2 : ih / 2 + prev.thickness,
        thickness: prev.thickness,
        frontHeight: type === "gaveta" ? 180 : undefined,
      };
      const updated = { ...prev, components: [...prev.components, comp] };
      if (type === "prateleira") {
        return { ...updated, components: redistributeShelves(updated) };
      }
      return updated;
    });
  }, []);

  const removeComponent = useCallback((id: string) => {
    setModule((prev) => {
      const updated = { ...prev, components: prev.components.filter((c) => c.id !== id) };
      return { ...updated, components: redistributeShelves(updated) };
    });
  }, []);

  const handleSave = () => {
    onSave?.(module);
    toast.success("Módulo salvo com sucesso!");
  };

  const handleReset = () => {
    setModule(createDefaultModule());
    toast.info("Módulo resetado");
  };

  const shelfCount = module.components.filter((c) => c.type === "prateleira").length;
  const doorCount = module.components.filter((c) => c.type === "porta").length;
  const drawerCount = module.components.filter((c) => c.type === "gaveta").length;
  const dividerCount = module.components.filter((c) => c.type === "divisoria").length;

  return (
    <div className="flex gap-3 h-[600px]">
      {/* Panel toggle for mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 left-2 z-30 md:hidden"
        onClick={() => setShowPanel(!showPanel)}
      >
        {showPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </Button>

      {/* ── Painel Lateral ── */}
      {showPanel && (
        <div className="w-full md:w-[360px] shrink-0 overflow-y-auto space-y-3">
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
                { label: "Largura (L)", key: "width" as const, min: 200, max: 1200 },
                { label: "Altura (A)", key: "height" as const, min: 200, max: 2400 },
                { label: "Profundidade (P)", key: "depth" as const, min: 200, max: 700 },
              ].map(({ label, key, min, max }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px]">{label}</Label>
                    <span className="text-xs font-mono text-muted-foreground">{module[key]}mm</span>
                  </div>
                  <Slider
                    value={[module[key]]}
                    min={min}
                    max={max}
                    step={10}
                    onValueChange={([v]) => updateDimension(key, v)}
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Espessura Chapa</Label>
                  <Input
                    type="number"
                    value={module.thickness}
                    onChange={(e) => setModule((p) => ({ ...p, thickness: Number(e.target.value) }))}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Espessura Fundo</Label>
                  <Input
                    type="number"
                    value={module.backThickness}
                    onChange={(e) => setModule((p) => ({ ...p, backThickness: Number(e.target.value) }))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => {
                          const comps = module.components.filter((c) => c.type === type);
                          const comp = comps.length > 0 ? comps[comps.length - 1] : undefined;
                          if (comp) removeComponent(comp.id);
                        }}
                        disabled={count === 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Badge variant="secondary" className="text-[10px] min-w-[20px] text-center">
                        {count}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => addComponent(type)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                  <span className="text-muted-foreground">Vão Interno</span>
                  <p className="font-mono font-semibold">{spans.vaoInterno}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Vão Livre</span>
                  <p className="font-mono font-semibold">{spans.vaoLivre.toFixed(0)}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Vão Unitário</span>
                  <p className="font-mono font-semibold">{spans.vaoUnitario}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Qtd. Vãos</span>
                  <p className="font-mono font-semibold">{spans.quantidadeVaos}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gap-1.5" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> Salvar Módulo
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Resetar
            </Button>
          </div>
        </div>
      )}

      {/* ── Área de Preview 3D + BOM ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* 3D Canvas */}
        <Card className="flex-1 relative overflow-hidden">
          <CardContent className="p-0 h-full">
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {module.width}×{module.height}×{module.depth}mm
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* BOM Tabs */}
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
                      <TableCell className="text-[10px] py-1 text-right font-mono">
                        {p.width.toFixed(0)}×{p.height.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">
                        {p.area.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-[10px] py-1 font-semibold">Total</TableCell>
                    <TableCell className="text-[10px] py-1" />
                    <TableCell className="text-[10px] py-1" />
                    <TableCell className="text-[10px] py-1 text-right font-mono font-semibold">
                      {bom.totalArea.toFixed(3)} m²
                    </TableCell>
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
      </div>
    </div>
  );
}
