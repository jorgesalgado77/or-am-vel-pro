import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KanbanFilters } from "../KanbanFilters";

function defaultProps(): React.ComponentProps<typeof KanbanFilters> {
  return {
    search: "",
    setSearch: vi.fn(),
    showFilters: false,
    setShowFilters: vi.fn(),
    hasActiveFilters: false,
    filterProjetista: "",
    setFilterProjetista: vi.fn(),
    filterIndicador: "",
    setFilterIndicador: vi.fn(),
    filterTemperature: "",
    setFilterTemperature: vi.fn(),
    filterTipoCliente: "",
    setFilterTipoCliente: vi.fn(),
    periodFilter: "mes_atual",
    setPeriodFilter: vi.fn(),
    dateStart: undefined,
    setDateStart: vi.fn(),
    dateEnd: undefined,
    setDateEnd: vi.fn(),
    projetistas: [],
    indicadores: [],
    filteredCount: 5,
    onClear: vi.fn(),
    onAdd: vi.fn(),
  };
}

describe("KanbanFilters", () => {
  it("renders search input", () => {
    render(<KanbanFilters {...defaultProps()} />);
    expect(screen.getByPlaceholderText(/Buscar por nome/)).toBeInTheDocument();
  });

  it("calls setSearch on input change", () => {
    const props = defaultProps();
    render(<KanbanFilters {...props} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "test" } });
    expect(props.setSearch).toHaveBeenCalledWith("test");
  });

  it("shows filter panel when showFilters is true", () => {
    render(<KanbanFilters {...defaultProps()} showFilters={true} />);
    expect(screen.getByText("Período")).toBeInTheDocument();
    expect(screen.getByText("Projetista")).toBeInTheDocument();
    expect(screen.getByText("Indicador")).toBeInTheDocument();
    expect(screen.getByText("Temperatura")).toBeInTheDocument();
    expect(screen.getByText("Tipo")).toBeInTheDocument();
  });

  it("hides filter panel when showFilters is false", () => {
    render(<KanbanFilters {...defaultProps()} showFilters={false} />);
    expect(screen.queryByText("Período")).not.toBeInTheDocument();
  });

  it("shows filtered count badge", () => {
    render(<KanbanFilters {...defaultProps()} showFilters={true} filteredCount={12} />);
    expect(screen.getByText("12 clientes")).toBeInTheDocument();
  });

  it("shows singular 'cliente' for count of 1", () => {
    render(<KanbanFilters {...defaultProps()} showFilters={true} filteredCount={1} />);
    expect(screen.getByText("1 cliente")).toBeInTheDocument();
  });

  it("shows clear button when hasActiveFilters", () => {
    render(<KanbanFilters {...defaultProps()} showFilters={true} hasActiveFilters={true} />);
    expect(screen.getByText("Limpar")).toBeInTheDocument();
  });

  it("hides clear button when no active filters", () => {
    render(<KanbanFilters {...defaultProps()} showFilters={true} hasActiveFilters={false} />);
    expect(screen.queryByText("Limpar")).not.toBeInTheDocument();
  });

  it("calls onClear when Limpar is clicked", () => {
    const props = { ...defaultProps(), showFilters: true, hasActiveFilters: true };
    render(<KanbanFilters {...props} />);
    fireEvent.click(screen.getByText("Limpar"));
    expect(props.onClear).toHaveBeenCalled();
  });

  it("shows active filters badge indicator", () => {
    render(<KanbanFilters {...defaultProps()} hasActiveFilters={true} />);
    expect(screen.getByText("!")).toBeInTheDocument();
  });

  it("calls onAdd when Novo Cliente is clicked", () => {
    const props = defaultProps();
    render(<KanbanFilters {...props} />);
    fireEvent.click(screen.getByText(/Novo Cliente/));
    expect(props.onAdd).toHaveBeenCalled();
  });
});
