/**
 * Tipos do Builder Paramétrico — OrçaMóvel Pro
 */

export type ComponentType = "prateleira" | "gaveta" | "porta" | "divisoria" | "nicho";

export interface InternalComponent {
  id: string;
  type: ComponentType;
  /** Posição Y relativa ao fundo interno do módulo (mm) */
  positionY: number;
  /** Espessura do componente (mm) */
  thickness: number;
  /** Largura do componente (mm) — default = largura interna */
  width?: number;
  /** Profundidade do componente (mm) — default = profundidade interna */
  depth?: number;
  /** Para portas: abertura (esquerda, direita, basculante) */
  opening?: "left" | "right" | "up" | "down";
  /** Para gavetas: altura da frente (mm) */
  frontHeight?: number;
  /** Cor/material override (se diferente do corpo) */
  materialId?: string;
}

export interface ModuleSlot {
  id: string;
  /** Posição X relativa à lateral esquerda interna (mm) */
  positionX: number;
  /** Largura do slot (mm) */
  width: number;
  /** Altura do slot (mm) */
  height: number;
  /** Componentes dentro deste slot */
  components: InternalComponent[];
}

export interface ParametricModule {
  id: string;
  name: string;
  /** Dimensões externas em mm */
  width: number;
  height: number;
  depth: number;
  /** Espessura das chapas (mm) */
  thickness: number;
  /** Espessura do fundo (mm) — geralmente mais fino */
  backThickness: number;
  /** Número de divisões verticais (cria slots) */
  verticalDivisions: number;
  /** Componentes internos */
  components: InternalComponent[];
  /** Slots quando há divisões verticais */
  slots: ModuleSlot[];
  /** Cores/materiais */
  bodyMaterialId?: string;
  doorMaterialId?: string;
  /** Categoria da biblioteca */
  categoryId?: string;
  /** Metadados extras */
  metadata?: Record<string, any>;
}

export interface SpanResult {
  /** Altura interna total (mm) */
  vaoInterno: number;
  /** Altura livre após descontar prateleiras (mm) */
  vaoLivre: number;
  /** Altura de cada vão unitário (mm) */
  vaoUnitario: number;
  /** Número de vãos */
  quantidadeVaos: number;
  /** Posições Y calculadas para cada prateleira (mm) */
  shelfPositions: number[];
}

export interface PartListItem {
  name: string;
  quantity: number;
  width: number;
  height: number;
  thickness: number;
  /** Área em m² */
  area: number;
  /** Perímetro para fita de borda (m) */
  edgeBanding: number;
  material: string;
}

export interface HardwareItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface ModuleBOM {
  parts: PartListItem[];
  hardware: HardwareItem[];
  totalArea: number;
  totalEdgeBanding: number;
}

export const DEFAULT_MODULE: Omit<ParametricModule, "id"> = {
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

export const SNAP_GRID_MM = 10;
