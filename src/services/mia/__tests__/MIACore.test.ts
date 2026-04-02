import { describe, it, expect } from "vitest";
import { buildContext } from "../ContextBuilder";
import { getMIAOrchestrator } from "../MIAOrchestrator";

describe("MIA Core — Phase 1", () => {
  describe("ContextBuilder", () => {
    it("throws when tenant_id is empty", () => {
      expect(() =>
        buildContext({
          tenantId: "",
          userId: "u1",
          origin: "chat",
          context: "vendazap",
          message: "hi",
        })
      ).toThrow("tenant_id é obrigatório");
    });

    it("throws when user_id is empty", () => {
      expect(() =>
        buildContext({
          tenantId: "t1",
          userId: "",
          origin: "chat",
          context: "vendazap",
          message: "hi",
        })
      ).toThrow("user_id é obrigatório");
    });

    it("builds valid context", () => {
      const ctx = buildContext({
        tenantId: "tenant-abc",
        userId: "user-xyz",
        origin: "dealroom",
        context: "vendazap",
        message: "Olá",
      });

      expect(ctx.tenant_id).toBe("tenant-abc");
      expect(ctx.user_id).toBe("user-xyz");
      expect(ctx.origin).toBe("dealroom");
      expect(ctx.message).toBe("Olá");
      expect(ctx.timestamp).toBeTruthy();
    });
  });

  describe("MIAOrchestrator", () => {
    it("returns placeholder response for valid request", async () => {
      const mia = getMIAOrchestrator();
      const response = await mia.handleRequest({
        tenantId: "test-tenant",
        userId: "test-user",
        message: "teste",
        origin: "chat",
        context: "vendazap",
      });

      expect(response.type).toBe("text");
      expect(response.message).toContain("teste");
      expect(response.engine).toBe("vendazap");
      expect(response.error).toBeUndefined();
    });

    it("returns error when tenant_id is missing", async () => {
      const mia = getMIAOrchestrator();
      const response = await mia.handleRequest({
        tenantId: "",
        userId: "test-user",
        message: "teste",
        origin: "chat",
        context: "vendazap",
      });

      expect(response.error).toContain("tenant_id");
    });

    it("returns error when user_id is missing", async () => {
      const mia = getMIAOrchestrator();
      const response = await mia.handleRequest({
        tenantId: "test-tenant",
        userId: "",
        message: "teste",
        origin: "chat",
        context: "vendazap",
      });

      expect(response.error).toContain("user_id");
    });

    it("routes to correct engine per context", async () => {
      const mia = getMIAOrchestrator();
      const contexts = ["vendazap", "dealroom", "onboarding", "commercial", "cashflow", "argument"] as const;

      for (const ctx of contexts) {
        const response = await mia.handleRequest({
          tenantId: "t1",
          userId: "u1",
          message: "test",
          origin: "chat",
          context: ctx,
        });

        expect(response.engine).toBe(ctx);
        expect(response.type).toBe("text");
      }
    });
  });
});
