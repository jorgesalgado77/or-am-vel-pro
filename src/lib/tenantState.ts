/**
 * In-memory tenant state for non-React contexts (e.g. auditService).
 * Set by AuthContext on login/logout. Never use localStorage.
 */

let _tenantId: string | null = null;
let _userId: string | null = null;

export function setTenantState(tenantId: string | null, userId: string | null) {
  _tenantId = tenantId;
  _userId = userId;
}

export function getTenantId(): string | null {
  return _tenantId;
}

export function getUserId(): string | null {
  return _userId;
}
