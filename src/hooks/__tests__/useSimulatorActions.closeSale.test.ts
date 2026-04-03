import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockDelete = vi.fn();
const mockIn = vi.fn();
const mockUpdate = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

// Chain builder
function chainBuilder(terminal?: string) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return chain;
}

vi.mock("@/lib/supabaseClient", () => {
  const simChain = chainBuilder();
  const templateChain = chainBuilder();
  const contractChain = chainBuilder();
  const clientChain = chainBuilder();

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "simulations") return simChain;
        if (table === "contract_templates") return templateChain;
        if (table === "client_contracts") return contractChain;
        if (table === "clients") return clientChain;
        // fallback
        return chainBuilder();
      }),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/file" } })),
        })),
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/services/contractService", () => ({
  buildContractHtml: vi.fn(() => "<html>contract</html>"),
}));

vi.mock("@/services/commissionService", () => ({
  generateSaleCommissions: vi.fn(() => Promise.resolve({ count: 0 })),
}));

vi.mock("@/lib/pdfService", () => ({
  generateBudgetPdfServerSide: vi.fn(),
}));

vi.mock("@/lib/contractDocument", () => ({
  openContractPrintWindow: vi.fn(),
}));

vi.mock("@/services/auditService", () => ({
  logAudit: vi.fn(),
  getAuditUserInfo: vi.fn(() => ({})),
}));

vi.mock("@/services/system/SystemDiagnosticsService", () => ({
  logError: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  validateFileUpload: vi.fn(() => ({ valid: true })),
}));

vi.mock("@/services/fileImportService", () => ({
  parseProjectFile: vi.fn(() => ({ envName: "Test", pieces: 1, total: 100, fornecedor: "", corpo: "", porta: "", puxador: "", complemento: "", modelo: "", fileFormat: "txt", software: "generico" })),
}));

vi.mock("@/services/financialService", () => ({
  generateOrcamentoNumber: vi.fn(() => Promise.resolve({ numero_orcamento: "ORC-001", numero_orcamento_seq: 1 })),
  applyDiscounts: vi.fn((v: number) => v),
  FORMAS_PAGAMENTO_LABELS: { avista: "À Vista", boleto: "Boleto", credito: "Cartão de Crédito" },
}));

vi.mock("@/components/shared/UpgradePlanDialog", () => ({
  parsePlanLimitError: vi.fn(() => null),
}));

vi.mock("@/lib/financing", () => ({
  formatCurrency: vi.fn((v: number) => `R$ ${v.toFixed(2)}`),
  calculateSimulation: vi.fn(),
}));

import { renderHook, act } from "@testing-library/react";
import { useSimulatorActions } from "../useSimulatorActions";
import { toast } from "sonner";
import { logEvent } from "@/services/system/SystemDiagnosticsService";
import { supabase } from "@/lib/supabaseClient";

const baseClient = {
  id: "client-123",
  nome: "João Silva",
  cpf: "123.456.789-00",
  telefone1: "11999999999",
  email: "joao@example.com",
  numero_orcamento: "ORC-001",
  vendedor: "Maria",
  status: "novo",
} as any;

function createParams(overrides: Partial<any> = {}) {
  return {
    client: baseClient,
    linkedClient: null,
    resolvedTenantId: "tenant-abc",
    currentUser: { id: "user-1", nome_completo: "Maria" },
    settings: { company_name: "INOVAMAD" },
    valorTela: 10000,
    valorTelaComComissao: 10000,
    desconto1: 0,
    desconto2: 0,
    desconto3: 0,
    formaPagamento: "avista" as any,
    parcelas: 1,
    valorEntrada: 0,
    plusPercentual: 0,
    carenciaDias: 30 as const,
    result: { valorFinal: 10000, valorParcela: 10000, valorComDesconto: 10000 },
    environments: [] as any[],
    setEnvironments: vi.fn(),
    catalogProducts: [],
    setValorTela: vi.fn(),
    setImportedFile: vi.fn(),
    setDetectedSoftware: vi.fn(),
    selectedIndicador: null,
    comissaoPercentual: 0,
    checkDiscount: vi.fn(() => ({ allowed: true, violations: [] })),
    requestApproval: vi.fn(),
    validateAccess: vi.fn(() => Promise.resolve({ allowed: true })),
    recordSale: vi.fn(() => Promise.resolve({})),
    onClientCreated: vi.fn(),
    newClient: { nome: "", cpf: "", telefone1: "", telefone2: "", email: "", vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "" },
    showClientForm: false,
    setShowClientForm: vi.fn(),
    setNewClient: vi.fn(),
    activeStrategy: undefined,
    aiStrategyEnabled: false,
    ...overrides,
  };
}

describe("useSimulatorActions — Close Sale Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Generic fallback chain for any table (ai_learning_events etc.)
    const fallbackChain = () => {
      const c: any = {};
      const thenable = Object.assign(Promise.resolve({ data: null, error: null }), c);
      c.select = vi.fn(() => thenable);
      c.insert = vi.fn(() => thenable);
      c.delete = vi.fn(() => thenable);
      c.update = vi.fn(() => thenable);
      c.eq = vi.fn(() => thenable);
      c.in = vi.fn(() => thenable);
      c.order = vi.fn(() => thenable);
      c.limit = vi.fn(() => thenable);
      c.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
      c.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      c.then = (fn: any) => Promise.resolve({ data: null, error: null }).then(fn);
      return c;
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "simulations") {
        const c = fallbackChain();
        c.select.mockImplementation(() => {
          const q: any = {};
          q.eq = vi.fn(() => q);
          q.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return q;
        });
        c.insert.mockImplementation(() => {
          const q: any = {};
          q.select = vi.fn(() => q);
          q.single = vi.fn(() => Promise.resolve({ data: { id: "sim-001" }, error: null }));
          return q;
        });
        return c;
      }
      if (table === "contract_templates") {
        const c = fallbackChain();
        c.select.mockImplementation(() => {
          const q: any = {};
          q.eq = vi.fn(() => q);
          q.order = vi.fn(() => q);
          q.limit = vi.fn(() => q);
          q.maybeSingle = vi.fn(() => Promise.resolve({
            data: { id: "tpl-001", nome: "Template", conteudo_html: "<h1>Contract</h1>" },
            error: null,
          }));
          return q;
        });
        return c;
      }
      return fallbackChain();
    });
  });

  it("handleCloseSale shows error toast when no client is selected", async () => {
    const params = createParams({ client: null, linkedClient: null });
    const { result } = renderHook(() => useSimulatorActions(params));

    await act(async () => {
      await result.current.handleCloseSale();
    });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Selecione ou vincule um cliente"),
      expect.any(Object)
    );
  });

  it("handleCloseSale shows error when tenant is missing", async () => {
    const params = createParams({ resolvedTenantId: null });
    const { result } = renderHook(() => useSimulatorActions(params));

    await act(async () => {
      await result.current.handleCloseSale();
    });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Loja atual não identificada"),
      expect.any(Object)
    );
  });

  it("handleCloseSale blocks when environments have missing tech fields", async () => {
    const incompleteEnv = {
      id: "env-1", fileName: "test.txt", environmentName: "Cozinha",
      pieceCount: 5, totalValue: 5000, importedAt: new Date(),
      fornecedor: "Acme", corpo: "", porta: "MDF", puxador: "Inox",
      complemento: "", modelo: "", fileFormat: "txt" as const,
    };
    const params = createParams({ environments: [incompleteEnv] });
    const { result } = renderHook(() => useSimulatorActions(params));

    await act(async () => {
      await result.current.handleCloseSale();
    });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("campos técnicos obrigatórios pendentes"),
      expect.any(Object)
    );
  });

  it("handleCloseSale opens modal when all validations pass", async () => {
    const params = createParams();
    const { result } = renderHook(() => useSimulatorActions(params));

    await act(async () => {
      await result.current.handleCloseSale();
    });

    expect(result.current.closeSaleModalOpen).toBe(true);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Modal de fechamento de venda aberto" })
    );
  });

  it("handleCloseSaleConfirm returns false when client is null", async () => {
    const params = createParams({ client: null, linkedClient: null });
    const { result } = renderHook(() => useSimulatorActions(params));

    let returnValue: boolean = true;
    await act(async () => {
      returnValue = await result.current.handleCloseSaleConfirm({}, [], []);
    });

    expect(returnValue).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("vincule um cliente"),
      expect.any(Object)
    );
  });

  it("handleCloseSaleConfirm returns false when tenant is null", async () => {
    const params = createParams({ resolvedTenantId: null });
    const { result } = renderHook(() => useSimulatorActions(params));

    let returnValue: boolean = true;
    await act(async () => {
      returnValue = await result.current.handleCloseSaleConfirm({}, [], []);
    });

    expect(returnValue).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("loja atual não foi identificada"),
      expect.any(Object)
    );
  });

  it("buildContractHtml is called with correct client data", async () => {
    const { buildContractHtml } = await import("@/services/contractService");
    const params = createParams();
    const { result } = renderHook(() => useSimulatorActions(params));

    const formData = { nome_completo: "João Silva", cpf_cnpj: "123" };
    
    await act(async () => {
      await result.current.handleCloseSaleConfirm(formData, [], []);
    });

    expect(buildContractHtml).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        client: expect.objectContaining({ nome: "João Silva" }),
        formData: expect.objectContaining({ nome_completo: "João Silva" }),
      })
    );
  });
});
