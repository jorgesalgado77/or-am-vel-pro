// ==================== MASKS ====================

export function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    // (00) 0000-0000
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  // (00) 00000-0000
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function maskCodigoLoja(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.replace(/(\d{3})(\d)/, "$1.$2");
}

export function unmask(value: string): string {
  return value.replace(/\D/g, "");
}

export function isCnpj(value: string): boolean {
  return unmask(value).length > 11;
}

// ==================== VALIDATION ====================

export function validateCpf(cpf: string): boolean {
  const digits = unmask(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // all same digits

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(digits[10]);
}

export function validateCnpj(cnpj: string): boolean {
  const digits = unmask(cnpj);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
  let remainder = sum % 11;
  const d1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== d1) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
  remainder = sum % 11;
  const d2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(digits[13]) === d2;
}

export function validateCpfCnpj(value: string): { valid: boolean; type: "cpf" | "cnpj" | null; message?: string } {
  const digits = unmask(value);
  if (!digits) return { valid: true, type: null }; // empty is ok (optional field)
  
  if (digits.length <= 11) {
    if (digits.length < 11) return { valid: false, type: "cpf", message: "CPF incompleto" };
    if (!validateCpf(digits)) return { valid: false, type: "cpf", message: "CPF inválido" };
    return { valid: true, type: "cpf" };
  }
  
  if (digits.length < 14) return { valid: false, type: "cnpj", message: "CNPJ incompleto" };
  if (!validateCnpj(digits)) return { valid: false, type: "cnpj", message: "CNPJ inválido" };
  return { valid: true, type: "cnpj" };
}
