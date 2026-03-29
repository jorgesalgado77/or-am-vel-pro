import { describe, it, expect } from "vitest";
import { setTenantState, getTenantId, getUserId } from "../tenantState";

describe("tenantState isolation", () => {
  it("starts with null values", () => {
    setTenantState(null, null);
    expect(getTenantId()).toBeNull();
    expect(getUserId()).toBeNull();
  });

  it("sets and retrieves tenant/user", () => {
    setTenantState("tenant-abc", "user-123");
    expect(getTenantId()).toBe("tenant-abc");
    expect(getUserId()).toBe("user-123");
  });

  it("switching tenant clears previous", () => {
    setTenantState("tenant-abc", "user-123");
    setTenantState("tenant-xyz", "user-456");
    expect(getTenantId()).toBe("tenant-xyz");
    expect(getUserId()).toBe("user-456");
  });

  it("logout clears state", () => {
    setTenantState("tenant-abc", "user-123");
    setTenantState(null, null);
    expect(getTenantId()).toBeNull();
    expect(getUserId()).toBeNull();
  });

  it("tenants never mix — sequential operations", () => {
    const tenants = ["t1", "t2", "t3", "t4", "t5"];
    for (const t of tenants) {
      setTenantState(t, `u-${t}`);
      expect(getTenantId()).toBe(t);
      expect(getUserId()).toBe(`u-${t}`);
    }
  });
});
