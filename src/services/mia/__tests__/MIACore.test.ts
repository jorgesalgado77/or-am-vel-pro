import { describe, it, expect, vi } from "vitest";
import { buildContext } from "../ContextBuilder";
import { getMIAOrchestrator } from "../MIAOrchestrator";
import { miaGenerateResponse } from "../MIAAdapter";

describe("MIA Core — Phase 2", () => {
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

    it("builds valid context with all fields", () => {
      const ctx = buildContext({
        tenantId: "tenant-abc",
        userId: "user-xyz",
        origin: "dealroom",
        context: "vendazap",
        message: "Olá",
        metadata: { custom: "value" },
      });

      expect(ctx.tenant_id).toBe("tenant-abc");
      expect(ctx.user_id).toBe("user-xyz");
      expect(ctx.origin).toBe("dealroom");
      expect(ctx.message).toBe("Olá");
      expect(ctx.timestamp).toBeTruthy();
      expect(ctx.metadata).toEqual({ custom: "value" });
    });
  });

  describe("MIAOrchestrator", () => {
    it("routes to registered engines", async () => {
      const mia = getMIAOrchestrator();
      const contexts = ["vendazap", "dealroom", "onboarding", "commercial", "cashflow", "argument", "campaign"] as const;

      for (const ctx of contexts) {
        const response = await mia.handleRequest({
          tenantId: "t1",
          userId: "u1",
          message: "test",
          origin: "chat",
          context: ctx,
        });

        // All engines are registered, so should get engine type back
        expect(response.engine).toBe(ctx === "campaign" ? "vendazap" : ctx);
        expect(response.type).toBeTruthy();
      }
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

    it("generateResponse is an alias for handleRequest", async () => {
      const mia = getMIAOrchestrator();
      const request = {
        tenantId: "t1",
        userId: "u1",
        message: "test",
        origin: "chat" as const,
        context: "vendazap" as const,
      };

      const r1 = await mia.handleRequest(request);
      const r2 = await mia.generateResponse(request);

      // Both should succeed (same engine)
      expect(r1.engine).toBe(r2.engine);
      expect(r1.type).toBe(r2.type);
    });
  });

  describe("MIAAdapter", () => {
    it("auto-maps origin to context", async () => {
      // Should not throw, even though the edge function will fail in tests
      const response = await miaGenerateResponse({
        tenant_id: "t1",
        user_id: "u1",
        message: "test",
        origin: "dealroom",
      });

      // Engine should be mapped to "dealroom" from origin
      expect(response.engine).toBe("dealroom");
    });

    it("uses explicit context over origin mapping", async () => {
      const response = await miaGenerateResponse({
        tenant_id: "t1",
        user_id: "u1",
        message: "test",
        origin: "chat",
        context: "cashflow",
      });

      expect(response.engine).toBe("cashflow");
    });

    it("rejects empty tenant_id", async () => {
      const response = await miaGenerateResponse({
        tenant_id: "",
        user_id: "u1",
        message: "test",
        origin: "chat",
      });

      expect(response.error).toContain("tenant_id");
    });

    it("rejects empty user_id", async () => {
      const response = await miaGenerateResponse({
        tenant_id: "t1",
        user_id: "",
        message: "test",
        origin: "chat",
      });

      expect(response.error).toContain("user_id");
    });
  });
});
