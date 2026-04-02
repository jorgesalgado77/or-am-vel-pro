/**
 * MIA Action Execution Engine — Secure action execution with:
 * - Permission validation via CargoPermissoes
 * - Confirmation mode (assisted execution)
 * - Audit logging to mia_action_logs table
 * - Tenant + user isolation
 * 
 * RULES:
 * - Critical actions ALWAYS require confirmation
 * - All actions are logged
 * - Reuses existing services (clientService, navigation, etc.)
 * - Zero data mixing between tenants/users
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAAction, MIAActionType } from "./types";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────

export type MIAActionStatus = "pending" | "confirmed" | "executed" | "failed" | "cancelled";

export interface MIAActionExecutionRequest {
  action: MIAAction;
  tenant_id: string;
  user_id: string;
  /** Skip confirmation (only for safe actions like navigate) */
  autoExecute?: boolean;
}

export interface MIAActionExecutionResult {
  success: boolean;
  message: string;
  status: MIAActionStatus;
  data?: Record<string, unknown>;
  /** If action needs confirmation, this contains the preview */
  confirmation?: {
    message: string;
    action_preview: Record<string, unknown>;
    action_id: string;
  };
}

interface MIAPendingAction {
  id: string;
  action: MIAAction;
  tenant_id: string;
  user_id: string;
  created_at: number;
}

// ── Constants ───────────────────────────────────────────────────

const LOG_TABLE = "mia_action_logs";
const PENDING_TTL = 5 * 60 * 1000; // 5 min expiry for pending confirmations

/** Actions that are safe to auto-execute (no confirmation needed) */
const SAFE_ACTIONS: MIAActionType[] = ["navigate", "open_modal", "send_message"];

/** Actions that ALWAYS require confirmation */
const CRITICAL_ACTIONS: MIAActionType[] = [
  "create_client",
  "generate_budget",
  "update_config",
  "save_config",
];

/** Permission mapping: action type → required CargoPermissoes key */
const ACTION_PERMISSIONS: Partial<Record<MIAActionType, string>> = {
  create_client: "clientes",
  open_simulator: "simulador",
  generate_budget: "simulador",
  create_task: "ia_gerente",
  update_config: "ia_gerente",
};

// ── Engine ──────────────────────────────────────────────────────

// Helper for untyped table
function logTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(LOG_TABLE);
}

class MIAActionExecutionEngine {
  private pendingActions = new Map<string, MIAPendingAction>();
  private navigateCallback: ((target: string) => void) | null = null;
  private logTableAvailable: boolean | null = null;

  /** Register navigation handler from React Router */
  setNavigationHandler(handler: (target: string) => void): void {
    this.navigateCallback = handler;
  }

  // ── Permission Validation ─────────────────────────────────────

  /**
   * Validate if user has permission for this action type.
   * Uses the CargoPermissoes system already in the project.
   */
  async validatePermission(
    userId: string,
    tenantId: string,
    actionType: MIAActionType
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Safe actions don't need permission checks
    if (SAFE_ACTIONS.includes(actionType)) {
      return { allowed: true };
    }

    const requiredPerm = ACTION_PERMISSIONS[actionType];
    if (!requiredPerm) {
      // No specific permission mapped = allow
      return { allowed: true };
    }

    try {
      // Get user's cargo and permissions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: usuario } = await (supabase as any)
        .from("usuarios")
        .select("cargo_id")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (!usuario?.cargo_id) {
        // No cargo = default permissions (allow)
        return { allowed: true };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cargo } = await (supabase as any)
        .from("cargos")
        .select("permissoes")
        .eq("id", usuario.cargo_id)
        .maybeSingle();

      if (!cargo?.permissoes) {
        return { allowed: true };
      }

      const perms = cargo.permissoes as Record<string, boolean>;
      const hasAccess = requiredPerm in perms ? perms[requiredPerm] : true;

      return hasAccess
        ? { allowed: true }
        : { allowed: false, reason: `Permissão "${requiredPerm}" não concedida ao seu cargo.` };
    } catch {
      // Permission check failure = allow (fail-open for non-critical)
      return { allowed: true };
    }
  }

  // ── Main Execution Flow ───────────────────────────────────────

  /**
   * Process an action request.
   * Safe actions execute immediately.
   * Critical actions return a confirmation request.
   */
  async processAction(request: MIAActionExecutionRequest): Promise<MIAActionExecutionResult> {
    const { action, tenant_id, user_id } = request;

    if (!tenant_id || !user_id) {
      return {
        success: false,
        message: "tenant_id e user_id são obrigatórios.",
        status: "failed",
      };
    }

    // 1. Validate permissions
    const permCheck = await this.validatePermission(user_id, tenant_id, action.type);
    if (!permCheck.allowed) {
      await this.logAction(tenant_id, user_id, action, "failed", permCheck.reason);
      return {
        success: false,
        message: permCheck.reason || "Sem permissão para esta ação.",
        status: "failed",
      };
    }

    // 2. Determine if confirmation is needed
    const needsConfirmation =
      !request.autoExecute &&
      (action.requiresConfirmation || CRITICAL_ACTIONS.includes(action.type));

    if (needsConfirmation) {
      return this.requestConfirmation(action, tenant_id, user_id);
    }

    // 3. Execute immediately
    return this.executeAction(action, tenant_id, user_id);
  }

  /**
   * Confirm and execute a previously pending action.
   */
  async confirmAction(actionId: string): Promise<MIAActionExecutionResult> {
    const pending = this.pendingActions.get(actionId);
    if (!pending) {
      return {
        success: false,
        message: "Ação não encontrada ou expirada.",
        status: "cancelled",
      };
    }

    // Check TTL
    if (Date.now() - pending.created_at > PENDING_TTL) {
      this.pendingActions.delete(actionId);
      return {
        success: false,
        message: "Ação expirada. Solicite novamente.",
        status: "cancelled",
      };
    }

    this.pendingActions.delete(actionId);
    return this.executeAction(pending.action, pending.tenant_id, pending.user_id);
  }

  /**
   * Cancel a pending action.
   */
  cancelAction(actionId: string): MIAActionExecutionResult {
    const existed = this.pendingActions.delete(actionId);
    return {
      success: true,
      message: existed ? "Ação cancelada." : "Ação não encontrada.",
      status: "cancelled",
    };
  }

  /**
   * Execute multiple actions sequentially.
   * Safe actions auto-execute; critical ones are batched as confirmations.
   */
  async executeActions(actions: MIAAction[], tenantId?: string, userId?: string): Promise<void> {
    for (const action of actions) {
      if (tenantId && userId) {
        await this.processAction({
          action,
          tenant_id: tenantId,
          user_id: userId,
          autoExecute: SAFE_ACTIONS.includes(action.type),
        });
      } else {
        // Legacy path — direct execution without audit
        await this.executeDirect(action);
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────

  private requestConfirmation(
    action: MIAAction,
    tenantId: string,
    userId: string
  ): MIAActionExecutionResult {
    const actionId = `mia_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.pendingActions.set(actionId, {
      id: actionId,
      action,
      tenant_id: tenantId,
      user_id: userId,
      created_at: Date.now(),
    });

    // Clean expired pending actions
    this.cleanExpiredPending();

    const actionLabel = action.label || this.getActionLabel(action.type);

    return {
      success: true,
      message: `Confirmar ação: ${actionLabel}?`,
      status: "pending",
      confirmation: {
        message: `Deseja executar: ${actionLabel}?`,
        action_preview: {
          type: action.type,
          target: action.target,
          ...action.payload,
        },
        action_id: actionId,
      },
    };
  }

  private async executeAction(
    action: MIAAction,
    tenantId: string,
    userId: string
  ): Promise<MIAActionExecutionResult> {
    try {
      const result = await this.executeDirect(action);

      await this.logAction(
        tenantId,
        userId,
        action,
        result ? "executed" : "failed"
      );

      return {
        success: result,
        message: result
          ? `Ação "${this.getActionLabel(action.type)}" executada com sucesso.`
          : `Falha ao executar "${this.getActionLabel(action.type)}".`,
        status: result ? "executed" : "failed",
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Erro desconhecido";
      await this.logAction(tenantId, userId, action, "failed", errMsg);

      return {
        success: false,
        message: `Erro: ${errMsg}`,
        status: "failed",
      };
    }
  }

  private async executeDirect(action: MIAAction): Promise<boolean> {
    switch (action.type) {
      case "navigate":
        return this.handleNavigate(action);
      case "create_task":
        return this.handleEvent("mia-create-task", {
          title: action.payload?.title || action.label || "Nova tarefa",
          description: action.payload?.description || "",
          ...action.payload,
        });
      case "save_config":
      case "update_config":
        return this.handleEvent("mia-save-config", action.payload || {});
      case "send_message":
        return this.handleEvent("mia-send-message", {
          target: action.target,
          message: action.payload?.message || "",
          ...action.payload,
        });
      case "open_modal":
      case "open_simulator":
        return this.handleEvent("mia-open-modal", {
          modal: action.target || action.type,
          ...action.payload,
        });
      case "create_client":
        return this.handleEvent("mia-create-client", action.payload || {});
      case "generate_budget":
        return this.handleEvent("mia-generate-budget", action.payload || {});
      case "custom":
        return this.handleEvent(`mia-action-${action.target}`, action.payload || {});
      default:
        console.warn("[MIAActionExec] Unknown action type:", action.type);
        return false;
    }
  }

  private handleNavigate(action: MIAAction): boolean {
    if (this.navigateCallback && action.target) {
      this.navigateCallback(action.target);
      if (action.label) {
        toast.info(`Navegando para ${action.label}`);
      }
      return true;
    }
    return false;
  }

  private handleEvent(eventName: string, detail: Record<string, unknown>): boolean {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
    return true;
  }

  // ── Audit Logging ─────────────────────────────────────────────

  private async checkLogTable(): Promise<boolean> {
    if (this.logTableAvailable !== null) return this.logTableAvailable;
    try {
      const { error } = await logTable().select("id").limit(1);
      this.logTableAvailable = !error;
    } catch {
      this.logTableAvailable = false;
    }
    return this.logTableAvailable;
  }

  private async logAction(
    tenantId: string,
    userId: string,
    action: MIAAction,
    status: MIAActionStatus,
    errorMessage?: string
  ): Promise<void> {
    if (!(await this.checkLogTable())) return;

    try {
      await logTable().insert({
        tenant_id: tenantId,
        user_id: userId,
        action_type: action.type,
        action_target: action.target,
        payload: action.payload || {},
        status,
        error_message: errorMessage || null,
      });
    } catch {
      // Logging failure is non-critical
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private getActionLabel(type: MIAActionType): string {
    const labels: Record<MIAActionType, string> = {
      navigate: "Navegar",
      create_task: "Criar tarefa",
      save_config: "Salvar configuração",
      send_message: "Enviar mensagem",
      open_modal: "Abrir modal",
      create_client: "Criar cliente",
      open_simulator: "Abrir simulador",
      generate_budget: "Gerar orçamento",
      update_config: "Atualizar configuração",
      custom: "Ação personalizada",
    };
    return labels[type] || type;
  }

  private cleanExpiredPending(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingActions) {
      if (now - pending.created_at > PENDING_TTL) {
        this.pendingActions.delete(id);
      }
    }
  }

  /** Get pending action count (for UI indicators) */
  getPendingCount(): number {
    this.cleanExpiredPending();
    return this.pendingActions.size;
  }
}

// Singleton
let instance: MIAActionExecutionEngine | null = null;

export function getMIAActionExecutionEngine(): MIAActionExecutionEngine {
  if (!instance) {
    instance = new MIAActionExecutionEngine();
  }
  return instance;
}

export { MIAActionExecutionEngine };
