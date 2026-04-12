/**
 * Stock movement recording helper
 */
import { supabase } from "@/lib/supabaseClient";

export type StockMovementType = "entrada" | "saida" | "ajuste";

export interface StockMovementRecord {
  tenant_id: string;
  product_id: string;
  user_id?: string;
  type: StockMovementType;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason?: string;
  reference_id?: string;
}

export async function recordStockMovement(movement: StockMovementRecord): Promise<void> {
  try {
    await supabase.from("stock_movements" as any).insert(movement as any);
  } catch {
    // Silent fail — table may not exist yet
    console.warn("[Stock Movement] Failed to record movement");
  }
}
