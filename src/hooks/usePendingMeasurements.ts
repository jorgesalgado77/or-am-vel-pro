import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";

export function usePendingMeasurements(userId?: string, cargoNome?: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId || !cargoNome) return;
    const tenantId = getTenantId();
    if (!tenantId) return;

    const cargo = cargoNome.toLowerCase();
    const isTechnical = cargo.includes("tecnico") || cargo.includes("técnico") ||
      cargo.includes("liberador") || cargo.includes("conferente") ||
      cargo.includes("gerente");

    if (!isTechnical) return;

    const fetchCount = async () => {
      let query = supabase
        .from("tasks" as any)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("tipo", "medicao")
        .in("status", ["nova", "pendente", "em_execucao"]);

      const isAdminOrManager = cargo.includes("administrador") || (cargo.includes("gerente") && !cargo.includes("tecnico") && !cargo.includes("técnico"));
      if (!isAdminOrManager) {
        query = query.eq("responsavel_id", userId);
      }

      const { count: total } = await query;
      setCount(total || 0);
    };

    fetchCount();

    const channel = supabase
      .channel(`pending-measurements-${tenantId}`)
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "tasks",
        filter: `tenant_id=eq.${tenantId}`,
      }, () => { fetchCount(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, cargoNome]);

  return count;
}
