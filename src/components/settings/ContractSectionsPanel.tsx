/**
 * Drag-and-drop panel for reordering contract sections within a page.
 * Detects sections by title elements and allows visual reordering.
 */
import { useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { GripVertical, FileText } from "lucide-react";

interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  [key: string]: unknown;
}

interface DetectedSection {
  id: string;
  title: string;
  titleElementId: string;
  elementIds: string[];
  startY: number;
  endY: number;
}

const SECTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /DADOS\s+DO\s+CLIENTE/i, label: "Dados do Cliente" },
  { pattern: /ENDERE[CÇ]O\s+DE\s+ENTREGA/i, label: "Endereço de Entrega" },
  { pattern: /AMBIENTES?\s+E\s+VALORES/i, label: "Ambientes e Valores" },
  { pattern: /DETALHES?\s+D[OE]S?\s+AMBIENTES?/i, label: "Detalhes dos Ambientes" },
  { pattern: /PRODUTOS?\s+D[OE]\s+CAT[AÁ]LOGO/i, label: "Produtos do Catálogo" },
  { pattern: /OBSERVA[CÇ][OÕ]ES/i, label: "Observações" },
  { pattern: /RESUMO\s+FINANCEIRO/i, label: "Resumo Financeiro" },
  { pattern: /CONDI[CÇ][OÕ]ES\s+GERAIS/i, label: "Condições Gerais" },
  { pattern: /RESPONS[AÁ]VEIS/i, label: "Responsáveis" },
  { pattern: /ASSINATURAS?/i, label: "Assinaturas" },
  { pattern: /FORMA\s+DE\s+PAGAMENTO/i, label: "Forma de Pagamento" },
];

function matchSectionTitle(text: string): string | null {
  const clean = text.replace(/<[^>]*>/g, "").trim();
  for (const { pattern, label } of SECTION_PATTERNS) {
    if (pattern.test(clean)) return label;
  }
  return null;
}

interface Props {
  elements: CanvasElement[];
  onReorder: (reorderedElements: CanvasElement[]) => void;
}

export function ContractSectionsPanel({ elements, onReorder }: Props) {
  // Detect sections: find title elements and group elements below each title until the next title
  const sections = useMemo<DetectedSection[]>(() => {
    // Find all title elements (bold text matching known patterns)
    const titleElements = elements
      .filter(el => {
        if (el.type !== "text") return false;
        const label = matchSectionTitle(el.text);
        return label !== null;
      })
      .sort((a, b) => a.y - b.y);

    if (titleElements.length === 0) return [];

    const result: DetectedSection[] = [];

    for (let i = 0; i < titleElements.length; i++) {
      const titleEl = titleElements[i];
      const label = matchSectionTitle(titleEl.text)!;
      const nextTitleY = i < titleElements.length - 1 ? titleElements[i + 1].y : Infinity;

      // All elements between this title's Y and the next title's Y belong to this section
      const sectionElements = elements.filter(el => {
        return el.y >= titleEl.y && el.y < nextTitleY;
      });

      result.push({
        id: titleEl.id,
        title: label,
        titleElementId: titleEl.id,
        elementIds: sectionElements.map(e => e.id),
        startY: titleEl.y,
        endY: Math.max(...sectionElements.map(e => e.y + (e.height as number))),
      });
    }

    return result;
  }, [elements]);

  // Elements NOT belonging to any section (header chrome, etc.)
  const sectionElementIds = useMemo(() => {
    const ids = new Set<string>();
    sections.forEach(s => s.elementIds.forEach(id => ids.add(id)));
    return ids;
  }, [sections]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;

    const reordered = [...sections];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Recalculate Y positions: keep non-section elements in place,
    // reposition section elements based on new order
    const elementMap = new Map(elements.map(e => [e.id, e]));

    // Find the first section's original start Y as the base
    const firstSectionY = Math.min(...sections.map(s => s.startY));

    let cursorY = firstSectionY;
    const updates = new Map<string, number>(); // elementId -> new Y offset

    for (const section of reordered) {
      const originalStartY = section.startY;
      const deltaY = cursorY - originalStartY;

      for (const elId of section.elementIds) {
        const el = elementMap.get(elId);
        if (el) {
          updates.set(elId, el.y + deltaY);
        }
      }

      // Move cursor past this section
      const sectionHeight = section.endY - section.startY;
      cursorY += sectionHeight + 15; // 15px gap between sections
    }

    // Apply updates
    const newElements = elements.map(el => {
      const newY = updates.get(el.id);
      if (newY !== undefined) {
        return { ...el, y: newY } as CanvasElement;
      }
      return el;
    });

    onReorder(newElements);
  }, [sections, elements, onReorder]);

  if (sections.length < 2) {
    return (
      <div className="text-[10px] text-muted-foreground px-1 py-2 text-center">
        {sections.length === 0 ? "Nenhuma seção detectada" : "Apenas 1 seção na página"}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="contract-sections">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-0.5">
            {sections.map((section, idx) => (
              <Draggable key={section.id} draggableId={section.id} index={idx}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] cursor-grab active:cursor-grabbing transition-colors ${
                      snapshot.isDragging
                        ? "bg-primary/20 shadow-sm ring-1 ring-primary/30"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium text-foreground">{section.title}</span>
                    <span className="ml-auto text-muted-foreground/60 text-[9px]">{section.elementIds.length}</span>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
