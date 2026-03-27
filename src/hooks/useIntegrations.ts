import { useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  reply_to?: string;
}

interface AsaasCustomerParams {
  name: string;
  email?: string;
  cpfCnpj: string;
  phone?: string;
}

interface AsaasPaymentParams {
  customer_id: string;
  value: number;
  billing_type: "PIX" | "BOLETO" | "CREDIT_CARD";
  due_date?: string;
  description?: string;
  client_name?: string;
  client_email?: string;
  client_cpf_cnpj?: string;
}

interface GeneratePDFParams {
  template_id?: string;
  provider?: "pdfmonkey" | "pdfgenerator" | "internal";
  payload: Record<string, unknown>;
}

export function useResendEmail(tenantId: string | null) {
  const sendEmail = useCallback(async (params: SendEmailParams) => {
    if (!tenantId) { toast.error("Tenant não identificado"); return null; }

    const { data, error } = await supabase.functions.invoke("resend-email", {
      body: { action: "send", tenant_id: tenantId, ...params },
    });

    if (error) { toast.error("Erro ao enviar email"); return null; }
    if (!data?.success) { toast.error(data?.error || "Falha no envio"); return null; }

    toast.success("Email enviado com sucesso!");
    return data;
  }, [tenantId]);

  const verifyDomain = useCallback(async () => {
    if (!tenantId) return null;
    const { data } = await supabase.functions.invoke("resend-email", {
      body: { action: "verify", tenant_id: tenantId },
    });
    return data;
  }, [tenantId]);

  return { sendEmail, verifyDomain };
}

export function useAsaasBilling(tenantId: string | null) {
  const createCustomer = useCallback(async (params: AsaasCustomerParams) => {
    if (!tenantId) { toast.error("Tenant não identificado"); return null; }

    const { data, error } = await supabase.functions.invoke("asaas-billing", {
      body: { action: "createCustomer", tenant_id: tenantId, ...params },
    });

    if (error || !data?.success) {
      toast.error(data?.error || "Erro ao criar cliente no Asaas");
      return null;
    }

    toast.success("Cliente criado no Asaas!");
    return data.data;
  }, [tenantId]);

  const createPayment = useCallback(async (params: AsaasPaymentParams) => {
    if (!tenantId) { toast.error("Tenant não identificado"); return null; }

    const { data, error } = await supabase.functions.invoke("asaas-billing", {
      body: { action: "createPayment", tenant_id: tenantId, ...params },
    });

    if (error || !data?.success) {
      toast.error(data?.error || "Erro ao criar cobrança");
      return null;
    }

    const type = params.billing_type;
    if (type === "PIX") toast.success("Cobrança PIX criada!");
    else if (type === "BOLETO") toast.success("Boleto gerado!");
    else toast.success("Cobrança criada!");

    return data.data;
  }, [tenantId]);

  const getPayment = useCallback(async (paymentId: string) => {
    if (!tenantId) return null;
    const { data } = await supabase.functions.invoke("asaas-billing", {
      body: { action: "getPayment", tenant_id: tenantId, payment_id: paymentId },
    });
    return data?.success ? data.data : null;
  }, [tenantId]);

  const getPixQR = useCallback(async (paymentId: string) => {
    if (!tenantId) return null;
    const { data } = await supabase.functions.invoke("asaas-billing", {
      body: { action: "getPixQR", tenant_id: tenantId, payment_id: paymentId },
    });
    return data?.success ? data.data : null;
  }, [tenantId]);

  const listPayments = useCallback(async (customerId?: string, status?: string) => {
    if (!tenantId) return [];
    const { data } = await supabase.functions.invoke("asaas-billing", {
      body: { action: "listPayments", tenant_id: tenantId, customer_id: customerId, status },
    });
    return data?.success ? data.data?.data || [] : [];
  }, [tenantId]);

  return { createCustomer, createPayment, getPayment, getPixQR, listPayments };
}

export function useDocumentGenerator(tenantId: string | null) {
  const generatePDF = useCallback(async (params: GeneratePDFParams) => {
    if (!tenantId) { toast.error("Tenant não identificado"); return null; }

    const { data, error } = await supabase.functions.invoke("generate-pdf", {
      body: {
        action: "generate",
        tenant_id: tenantId,
        provider: params.provider,
        data: {
          template_id: params.template_id,
          payload: params.payload,
        },
      },
    });

    if (error || !data?.success) {
      toast.error(data?.error || "Erro ao gerar PDF");
      return null;
    }

    toast.success("PDF gerado com sucesso!");
    return data;
  }, [tenantId]);

  const checkStatus = useCallback(async (documentId: string) => {
    if (!tenantId) return null;
    const { data } = await supabase.functions.invoke("generate-pdf", {
      body: { action: "status", tenant_id: tenantId, document_id: documentId },
    });
    return data?.success ? data : null;
  }, [tenantId]);

  return { generatePDF, checkStatus };
}
