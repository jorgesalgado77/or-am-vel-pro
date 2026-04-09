import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentTenantId, getResolvedTenantId } from "@/contexts/TenantContext";

export interface UsefulPhone {
  id: string;
  tenant_id: string;
  setor: string;
  responsavel: string;
  telefone: string;
  ordem: number;
}

export function useCompanyPhones() {
  const [phones, setPhones] = useState<UsefulPhone[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPhones = useCallback(async () => {
    const tenantId = getCurrentTenantId() || (await getResolvedTenantId());
    if (!tenantId) { setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("company_useful_phones")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("ordem", { ascending: true });
    if (data) setPhones(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPhones(); }, [fetchPhones]);

  const addPhone = useCallback(async (phone: Omit<UsefulPhone, "id" | "tenant_id" | "ordem">) => {
    const tenantId = getCurrentTenantId() || (await getResolvedTenantId());
    if (!tenantId) return;
    const { data, error } = await (supabase as any)
      .from("company_useful_phones")
      .insert({ ...phone, tenant_id: tenantId, ordem: phones.length })
      .select("*")
      .single();
    if (error) throw error;
    if (data) setPhones(prev => [...prev, data]);
    return data;
  }, [phones.length]);

  const updatePhone = useCallback(async (id: string, updates: Partial<UsefulPhone>) => {
    const { error } = await (supabase as any)
      .from("company_useful_phones")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePhone = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from("company_useful_phones")
      .delete()
      .eq("id", id);
    if (error) throw error;
    setPhones(prev => prev.filter(p => p.id !== id));
  }, []);

  return { phones, loading, fetchPhones, addPhone, updatePhone, deletePhone };
}