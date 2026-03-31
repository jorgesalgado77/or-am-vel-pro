import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KanbanCard } from "../KanbanCard";
import type { Client, LastSimInfo } from "../kanbanTypes";

const baseClient: Client = {
  id: "c1",
  nome: "João Silva",
  cpf: "12345678900",
  telefone1: "(11) 99999-0000",
  telefone2: null,
  email: "joao@test.com",
  status: "novo",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  tenant_id: "t1",
  vendedor: null,
  numero_orcamento: "001",
  numero_orcamento_seq: 1,
  quantidade_ambientes: null,
  descricao_ambientes: null,
  indicador_id: null,
};

function renderCard(props: Partial<React.ComponentProps<typeof KanbanCard>> = {}) {
  const defaults = {
    client: baseClient,
    index: 0,
    sim: undefined,
    budgetValidityDays: 30,
    cargoNome: "administrador",
    tenantId: "t1",
    onClick: vi.fn(),
  };
  return render(
    <TooltipProvider>
      <DragDropContext onDragEnd={() => {}}>
        <Droppable droppableId="test">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              <KanbanCard {...defaults} {...props} />
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </TooltipProvider>
  );
}

describe("KanbanCard", () => {
  it("renders client name", () => {
    renderCard();
    expect(screen.getByText("João Silva")).toBeInTheDocument();
  });

  it("shows 'Cliente Loja' badge for manual clients in 'novo' status", () => {
    renderCard({ client: { ...baseClient, status: "novo", origem_lead: null } as any });
    expect(screen.getByText("Cliente Loja")).toBeInTheDocument();
  });

  it("shows 'Lead Recebido' badge for lead clients in 'novo' status", () => {
    renderCard({ client: { ...baseClient, status: "novo", origem_lead: "landing_page" } as any });
    expect(screen.getByText("Lead Recebido")).toBeInTheDocument();
  });

  it("does not show origin badge for non-novo status", () => {
    renderCard({ client: { ...baseClient, status: "em_negociacao" } as any });
    expect(screen.queryByText("Cliente Loja")).not.toBeInTheDocument();
    expect(screen.queryByText("Lead Recebido")).not.toBeInTheDocument();
  });

  it("shows budget number", () => {
    renderCard({ client: { ...baseClient, numero_orcamento: "ORÇ-042" } as any });
    expect(screen.getByText("ORÇ-042")).toBeInTheDocument();
  });

  it("shows simulation value when sim provided", () => {
    const sim: LastSimInfo = { valor_final: 15000, valor_com_desconto: 14000, created_at: new Date().toISOString(), sim_count: 1 };
    renderCard({ sim });
    expect(screen.getByText(/14\.000/)).toBeInTheDocument();
  });

  it("shows vendedor name for admin cargo", () => {
    renderCard({ client: { ...baseClient, vendedor: "Maria Santos" } as any, cargoNome: "administrador" });
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
  });

  it("hides vendedor for vendedor cargo", () => {
    renderCard({ client: { ...baseClient, vendedor: "Maria Santos" } as any, cargoNome: "vendedor" });
    expect(screen.queryByText("Maria Santos")).not.toBeInTheDocument();
  });

  it("shows expired badge when simulation is old", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const sim: LastSimInfo = { valor_final: 10000, valor_com_desconto: 9000, created_at: oldDate.toISOString(), sim_count: 1 };
    renderCard({ sim, budgetValidityDays: 30 });
    expect(screen.getByText("Orçamento expirado")).toBeInTheDocument();
  });

  it("prioritizes closed contract over expired budget", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const sim: LastSimInfo = { valor_final: 10000, valor_com_desconto: 9000, created_at: oldDate.toISOString(), sim_count: 1 };
    renderCard({
      client: { ...baseClient, status: "em_medicao", data_contrato: new Date().toISOString(), contrato_fechado_visual: true } as any,
      sim,
      budgetValidityDays: 30,
    });
    expect(screen.getByText(/Contrato Fechado/i)).toBeInTheDocument();
    expect(screen.queryByText("Orçamento expirado")).not.toBeInTheDocument();
  });

  it("shows temperature badge", () => {
    renderCard({ client: { ...baseClient, lead_temperature: "quente" } as any });
    expect(screen.getByText(/Quente/)).toBeInTheDocument();
  });

  it("shows aging indicator 'hoje' for new cards", () => {
    renderCard();
    expect(screen.getByText("hoje")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    renderCard({ onClick });
    const el = screen.getByText("João Silva").closest("[class*='rounded']");
    if (el) fireEvent.click(el);
    expect(onClick).toHaveBeenCalledWith(baseClient);
  });

  it("shows follow-up badge when followUpStatus is active", () => {
    renderCard({ followUpStatus: "active" });
    expect(screen.getByText("FU")).toBeInTheDocument();
  });
});
