import { useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { GripVertical, FileText } from "lucide-react";
import type { CanvasElement, PageData } from "./contract-editor/types";

interface DetectedSection {
  id: string;
  pageIndex: number;
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
  { pattern: /OBSERVA(?:ÇÕES|COES)/i, label: "Observações" },
  { pattern: /RESUMO\s+FINANCEIRO/i, label: "Resumo Financeiro" },
  { pattern: /CONDI(?:ÇÕES|COES)\s+GERAIS/i, label: "Condições Gerais" },
  { pattern: /RESPONS[AÁ]VEIS/i, label: "Responsáveis" },
  { pattern: /ASSINATURAS?/i, label: "Assinaturas" },
  { pattern: /FORMA\s+DE\s+PAGAMENTO/i, label: "Forma de Pagamento" },
];

const SECTION_GAP = 16;
const DEFAULT_SECTION_START_Y = 100;

function matchSectionTitle(text: string): string | null {
  const clean = text.replace(/<[^>]*>/g, "").trim();
  for (const { pattern, label } of SECTION_PATTERNS) {
    if (pattern.test(clean)) return label;
  }
  return null;
}

function detectSectionsOnPage(page: PageData, pageIndex: number): DetectedSection[] {
  const titleElements = page.elements
    .filter((el) => el.type === "text" && matchSectionTitle(el.text))
    .sort((a, b) => a.y - b.y || a.zIndex - b.zIndex);

  if (titleElements.length === 0) return [];

  return titleElements.map((titleEl, index) => {
    const nextTitleY = index < titleElements.length - 1 ? titleElements[index + 1].y : Number.POSITIVE_INFINITY;
    const sectionElements = page.elements.filter((el) => el.y >= titleEl.y && el.y < nextTitleY);
    return {
      id: titleEl.id,
      pageIndex,
      title: matchSectionTitle(titleEl.text) || "Seção",
      titleElementId: titleEl.id,
      elementIds: sectionElements.map((el) => el.id),
      startY: titleEl.y,
      endY: Math.max(...sectionElements.map((el) => el.y + el.height), titleEl.y + titleEl.height),
    };
  });
}

function rebuildPageSections(page: PageData, orderedSections: DetectedSection[]): PageData {
  const sectionElementIds = new Set(orderedSections.flatMap((section) => section.elementIds));
  const nonSectionElements = page.elements.filter((el) => !sectionElementIds.has(el.id));
  const elementMap = new Map(page.elements.map((el) => [el.id, el]));
  const originalPageSections = detectSectionsOnPage(page, 0);
  const originalBaseY = originalPageSections.length > 0
    ? Math.min(...originalPageSections.map((section) => section.startY))
    : DEFAULT_SECTION_START_Y;

  let cursorY = orderedSections.length > 0
    ? Math.min(...orderedSections.map((section) => section.startY), originalBaseY)
    : originalBaseY;

  const rebuiltSectionElements: CanvasElement[] = [];

  for (const section of orderedSections) {
    const deltaY = cursorY - section.startY;
    const sectionElements = section.elementIds
      .map((id) => elementMap.get(id))
      .filter(Boolean)
      .map((el) => ({ ...(el as CanvasElement), y: (el as CanvasElement).y + deltaY }));

    rebuiltSectionElements.push(...sectionElements);
    cursorY += (section.endY - section.startY) + SECTION_GAP;
  }

  return {
    ...page,
    elements: [...nonSectionElements, ...rebuiltSectionElements].sort((a, b) => a.zIndex - b.zIndex),
  };
}

function parsePageIndex(droppableId: string) {
  return Number(droppableId.replace("page-", ""));
}

interface Props {
  pages: PageData[];
  currentPageIdx: number;
  onReorderPages: (pages: PageData[]) => void;
}

export function ContractSectionsPanel({ pages, currentPageIdx, onReorderPages }: Props) {
  const sectionsByPage = useMemo(() => pages.map((page, pageIndex) => detectSectionsOnPage(page, pageIndex)), [pages]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;

    const sourcePageIdx = parsePageIndex(result.source.droppableId);
    const destinationPageIdx = parsePageIndex(result.destination.droppableId);
    const sourceSections = [...(sectionsByPage[sourcePageIdx] || [])];
    const destinationSections = sourcePageIdx === destinationPageIdx
      ? sourceSections
      : [...(sectionsByPage[destinationPageIdx] || [])];

    const movedSection = sourceSections[result.source.index];
    if (!movedSection) return;

    sourceSections.splice(result.source.index, 1);
    destinationSections.splice(result.destination.index, 0, {
      ...movedSection,
      pageIndex: destinationPageIdx,
      startY: destinationSections[result.destination.index - 1]?.endY
        ? destinationSections[result.destination.index - 1].endY + SECTION_GAP
        : (destinationSections[0]?.startY ?? DEFAULT_SECTION_START_Y),
    });

    const nextPages = [...pages];

    const movedElementIds = new Set(movedSection.elementIds);
    const movedElements = pages[sourcePageIdx].elements.filter((el) => movedElementIds.has(el.id));
    const destinationPageElements = sourcePageIdx === destinationPageIdx
      ? pages[sourcePageIdx].elements
      : [...pages[destinationPageIdx].elements, ...movedElements.map((el) => ({ ...el }))];

    nextPages[sourcePageIdx] = {
      ...pages[sourcePageIdx],
      elements: sourcePageIdx === destinationPageIdx
        ? destinationPageElements
        : pages[sourcePageIdx].elements.filter((el) => !movedElementIds.has(el.id)),
    };

    if (sourcePageIdx !== destinationPageIdx) {
      nextPages[destinationPageIdx] = {
        ...pages[destinationPageIdx],
        elements: destinationPageElements,
      };
    }

    nextPages[sourcePageIdx] = rebuildPageSections(nextPages[sourcePageIdx], sourceSections);
    nextPages[destinationPageIdx] = rebuildPageSections(nextPages[destinationPageIdx], destinationSections);

    onReorderPages(nextPages);
  }, [onReorderPages, pages, sectionsByPage]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-2">
        {pages.map((_, pageIndex) => {
          const sections = sectionsByPage[pageIndex] || [];
          return (
            <div
              key={pageIndex}
              className={`rounded-md border ${pageIndex === currentPageIdx ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}
            >
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Página {pageIndex + 1}</span>
                <span>{sections.length} seções</span>
              </div>
              <Droppable droppableId={`page-${pageIndex}`}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-0.5 px-1.5 pb-1.5 min-h-10 ${snapshot.isDraggingOver ? "bg-muted/50" : ""}`}
                  >
                    {sections.map((section, sectionIndex) => (
                      <Draggable key={section.id} draggableId={section.id} index={sectionIndex}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] transition-colors ${dragSnapshot.isDragging ? "bg-primary/15 ring-1 ring-primary/30" : "hover:bg-muted/60"}`}
                          >
                            <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium text-foreground">{section.title}</span>
                            <span className="ml-auto text-[9px] text-muted-foreground/70">{section.elementIds.length}</span>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {sections.length === 0 && (
                      <div className="rounded border border-dashed border-border px-2 py-2 text-center text-[10px] text-muted-foreground">
                        Arraste uma seção para esta página
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
