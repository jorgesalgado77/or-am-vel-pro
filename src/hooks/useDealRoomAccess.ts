import { useState, useEffect } from "react";
import { useDealRoom } from "@/hooks/useDealRoom";
import { supabase } from "@/lib/supabaseClient";

export function useDealRoomAccess(tenantId: string | null) {
  const { validateAccess } = useDealRoom();
  const [access, setAccess] = useState<{ allowed: boolean; reason?: string; plano?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setAccess({ allowed: false, reason: "Tenant não encontrado" });
      setLoading(false);
      return;
    }
    const check = async () => {
      setLoading(true);
      const result = await validateAccess(tenantId);
      if (!result.allowed) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("recursos_vip")
          .eq("id", tenantId)
          .single();
        const vip = (tenant as any)?.recursos_vip;
        if (vip?.deal_room) {
          setAccess({ allowed: true, plano: "vip" });
          setLoading(false);
          return;
        }
      }
      setAccess(result);
      setLoading(false);
    };
    check();
  }, [tenantId]);

  return { access, loading };
}
