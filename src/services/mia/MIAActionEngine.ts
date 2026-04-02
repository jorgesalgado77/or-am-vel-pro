/**
 * MIA Action Engine — Execute real actions from AI responses
 * Handles navigation, task creation, config saving, etc.
 */

import type { MIAAction } from "./types";
import { toast } from "sonner";

export class MIAActionEngine {
  private navigateCallback: ((target: string) => void) | null = null;

  /** Register a navigation handler (from React Router) */
  setNavigationHandler(handler: (target: string) => void): void {
    this.navigateCallback = handler;
  }

  /** Execute a single action */
  async executeAction(action: MIAAction): Promise<boolean> {
    try {
      switch (action.type) {
        case "navigate":
          return this.handleNavigate(action);
        case "create_task":
          return this.handleCreateTask(action);
        case "save_config":
          return this.handleSaveConfig(action);
        case "send_message":
          return this.handleSendMessage(action);
        case "open_modal":
          return this.handleOpenModal(action);
        case "custom":
          return this.handleCustomAction(action);
        default:
          console.warn("[MIAAction] Unknown action type:", action.type);
          return false;
      }
    } catch (e) {
      console.error("[MIAAction] Error executing action:", e);
      return false;
    }
  }

  /** Execute multiple actions in sequence */
  async executeActions(actions: MIAAction[]): Promise<void> {
    for (const action of actions) {
      await this.executeAction(action);
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

  private handleCreateTask(action: MIAAction): boolean {
    // Dispatch custom event for task creation
    const event = new CustomEvent("mia-create-task", {
      detail: {
        title: action.payload?.title || action.label || "Nova tarefa",
        description: action.payload?.description || "",
        ...action.payload,
      },
    });
    window.dispatchEvent(event);
    toast.success(`Tarefa criada: ${action.label || "Nova tarefa"}`);
    return true;
  }

  private handleSaveConfig(action: MIAAction): boolean {
    const event = new CustomEvent("mia-save-config", {
      detail: action.payload,
    });
    window.dispatchEvent(event);
    return true;
  }

  private handleSendMessage(action: MIAAction): boolean {
    const event = new CustomEvent("mia-send-message", {
      detail: {
        target: action.target,
        message: action.payload?.message || "",
        ...action.payload,
      },
    });
    window.dispatchEvent(event);
    return true;
  }

  private handleOpenModal(action: MIAAction): boolean {
    const event = new CustomEvent("mia-open-modal", {
      detail: {
        modal: action.target,
        ...action.payload,
      },
    });
    window.dispatchEvent(event);
    return true;
  }

  private handleCustomAction(action: MIAAction): boolean {
    const event = new CustomEvent(`mia-action-${action.target}`, {
      detail: action.payload,
    });
    window.dispatchEvent(event);
    return true;
  }
}

// Singleton
let instance: MIAActionEngine | null = null;

export function getMIAActionEngine(): MIAActionEngine {
  if (!instance) {
    instance = new MIAActionEngine();
  }
  return instance;
}
