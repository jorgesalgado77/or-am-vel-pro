/**
 * Tipos do Builder Paramétrico — OrçaMóvel Pro
 */

export type ComponentType = "prateleira" | "gaveta" | "porta" | "divisoria" | "nicho";

export type ModuleType =
  | "caixa_inferior"
  | "caixa_superior"
  | "painel"
  | "regua"
  | "dormitorio_giro"
  | "dormitorio_correr"
  | "custom";

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
  /** Tipo de módulo pré-definido */
  moduleType: ModuleType;
  /** Dimensões externas em mm */
  width: number;
  height: number;
  depth: number;
  /** Espessura das chapas (mm) */
  thickness: number;
  /** Espessura do fundo (mm) — geralmente mais fino */
  backThickness: number;
  /** Altura do rodapé inferior (mm) — 0 se não houver */
  baseboardHeight: number;
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
  /** Largura interna livre (mm) */
  larguraInterna: number;
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

/** Espessuras de chapa disponíveis (mm) */
export const SHEET_THICKNESSES = [15, 18, 25, 36] as const;

/** Espessuras de fundo disponíveis (mm) */
export const BACK_THICKNESSES = [3, 6, 15, 18] as const;

export interface ModulePreset {
  type: ModuleType;
  label: string;
  description: string;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  backThickness: number;
  baseboardHeight: number;
}

export const MODULE_PRESETS: ModulePreset[] = [
  {
    type: "caixa_inferior",
    label: "Caixa Inferior",
    description: "Armário base de cozinha/banheiro",
    width: 700,
    height: 700,
    depth: 580,
    thickness: 18,
    backThickness: 3,
    baseboardHeight: 0,
  },
  {
    type: "caixa_superior",
    label: "Caixa Superior",
    description: "Armário aéreo de cozinha",
    width: 700,
    height: 350,
    depth: 330,
    thickness: 18,
    backThickness: 3,
    baseboardHeight: 0,
  },
  {
    type: "painel",
    label: "Painel",
    description: "Painel vertical decorativo ou divisor",
    width: 600,
    height: 2100,
    depth: 18,
    thickness: 18,
    backThickness: 3,
    baseboardHeight: 0,
  },
  {
    type: "regua",
    label: "Régua",
    description: "Painel de acabamento — apenas um painel plano",
    width: 60,
    height: 2700,
    depth: 18,
    thickness: 18,
    backThickness: 3,
    baseboardHeight: 0,
  },
  {
    type: "dormitorio_giro",
    label: "Dormitório Giro",
    description: "Roupeiro com portas de giro e rodapé de 85mm",
    width: 1000,
    height: 2100,
    depth: 580,
    thickness: 18,
    backThickness: 3,
    baseboardHeight: 85,
  },
  {
    type: "dormitorio_correr",
    label: "Dormitório Correr",
    description: "Roupeiro com portas de correr, sem rodapé",
    width: 1800,
    height: 2400,
    depth: 620,
    thickness: 18,
    backThickness: 3,
    baseboardHeight: 0,
  },
];

export const DEFAULT_MODULE: Omit<ParametricModule, "id"> = {
  name: "Novo Módulo",
  moduleType: "custom",
  width: 600,
  height: 720,
  depth: 500,
  thickness: 18,
  backThickness: 6,
  baseboardHeight: 0,
  verticalDivisions: 0,
  components: [],
  slots: [],
};

export const SNAP_GRID_MM = 10;
