/**
 * MIA Action Engine — Legacy compatibility layer.
 * Delegates to ActionExecutionEngine for new features.
 * Kept for backward compatibility with existing code.
 */

import type { MIAAction } from "./types";
import { getMIAActionExecutionEngine } from "./ActionExecutionEngine";

export class MIAActionEngine {
  private engine = getMIAActionExecutionEngine();

  /** Register a navigation handler (from React Router) */
  setNavigationHandler(handler: (target: string) => void): void {
    this.engine.setNavigationHandler(handler);
  }

  /** Execute a single action (legacy — no audit) */
  async executeAction(action: MIAAction): Promise<boolean> {
    const result = await this.engine.processAction({
      action,
      tenant_id: "",
      user_id: "",
      autoExecute: true,
    });
    return result.success;
  }

  /** Execute multiple actions in sequence (legacy) */
  async executeActions(actions: MIAAction[]): Promise<void> {
    await this.engine.executeActions(actions);
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
