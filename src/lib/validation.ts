/**
 * Centralized validation schemas for the application.
 * Uses Zod for type-safe runtime validation.
 */

import { z } from "zod";

// ==================== CLIENT VALIDATION ====================

export const clientSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().max(18).optional().or(z.literal("")),
  quantidade_ambientes: z.coerce.number().int().min(0).optional(),
  descricao_ambientes: z.string().max(2000).optional().or(z.literal("")),
  telefone1: z.string().max(20).optional().or(z.literal("")),
  telefone2: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  vendedor: z.string().max(200).optional().or(z.literal("")),
  indicador_id: z.string().optional().or(z.literal("")),
});

export type ClientFormData = z.infer<typeof clientSchema>;

// ==================== SALE FORM VALIDATION ====================

export const saleFormSchema = z.object({
  numero_contrato: z.string().max(50),
  data_fechamento: z.string(),
  responsavel_venda: z.string().max(200),
  nome_completo: z.string().trim().min(1, "Nome completo é obrigatório").max(200),
  data_nascimento: z.string(),
  cpf_cnpj: z.string().max(18),
  rg_insc_estadual: z.string().max(30),
  endereco: z.string().max(300),
  bairro: z.string().max(100),
  cidade: z.string().max(100),
  uf: z.string().max(2),
  cep: z.string().max(10),
  profissao: z.string().max(100),
  telefone: z.string().max(20),
  email: z.string().max(255).email("Email inválido").or(z.literal("")),
  endereco_entrega: z.string().max(300),
  prazo_entrega: z.string().max(50),
  bairro_entrega: z.string().max(100),
  cidade_entrega: z.string().max(100),
  uf_entrega: z.string().max(2),
  cep_entrega: z.string().max(10),
  observacoes: z.string().max(2000),
  valor_entrada: z.number().min(0),
  qtd_parcelas: z.number().int().min(1),
  valor_parcelas: z.number().min(0),
});

export type SaleFormData = z.infer<typeof saleFormSchema>;

// ==================== FILE UPLOAD VALIDATION ====================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  "text/plain",
  "text/xml",
  "application/xml",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const DANGEROUS_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr",
  ".ps1", ".vbs", ".js", ".sh", ".php", ".py",
];

export function validateFileUpload(file: File): { valid: boolean; message?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, message: `Arquivo muito grande (máximo ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { valid: false, message: "Tipo de arquivo não permitido" };
  }

  return { valid: true };
}

// ==================== SANITIZATION ====================

/**
 * Sanitizes a string to prevent XSS in contexts where
 * dangerouslySetInnerHTML is NOT used (most cases).
 * For HTML content (contracts), use DOMPurify or similar.
 */
export function sanitizeInput(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Validates that a monetary value is within acceptable bounds.
 */
export function validateMonetaryValue(value: number, max = 999_999_999): boolean {
  return value >= 0 && value <= max && isFinite(value);
}

/**
 * Validates discount percentage bounds.
 */
export function validateDiscount(value: number): boolean {
  return value >= 0 && value <= 100 && isFinite(value);
}

// ==================== CPF / CNPJ VALIDATION ====================

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(digits[10]);
}

export function isValidCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * weights1[i];
  let rest = sum % 11;
  if (Number(digits[12]) !== (rest < 2 ? 0 : 11 - rest)) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(digits[i]) * weights2[i];
  rest = sum % 11;
  return Number(digits[13]) === (rest < 2 ? 0 : 11 - rest);
}

export function validateCpfCnpj(value: string, tipo: "pf" | "pj"): { valid: boolean; message?: string } {
  const digits = value.replace(/\D/g, "");
  if (tipo === "pf") {
    if (digits.length !== 11) return { valid: false, message: "CPF deve ter 11 dígitos" };
    if (!isValidCPF(digits)) return { valid: false, message: "CPF inválido" };
  } else {
    if (digits.length !== 14) return { valid: false, message: "CNPJ deve ter 14 dígitos" };
    if (!isValidCNPJ(digits)) return { valid: false, message: "CNPJ inválido" };
  }
  return { valid: true };
}
