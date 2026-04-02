import { describe, it, expect, vi } from "vitest";
import { buildContext } from "../ContextBuilder";
import { getMIAOrchestrator } from "../MIAOrchestrator";
import { miaGenerateResponse } from "../MIAAdapter";
import type { MIAEngineInterface, MIARequest, MIAResponse } from "../types";

// Mock engine for testing routing without network calls
class MockEngine implements MIAEngineInterface {
  readonly engineType;
  constructor(type: "vendazap" | "dealroom" | "onboarding" | "commercial" | "cashflow" | "argument") {
    this.engineType = type;
  }
  async process(request: MIARequest): Promise<MIAResponse> {
    return {
      type: "text",
      message: `mock-${this.engineType}: ${request.message}`,
      engine: this.engineType,
      provider: "mock",
    };
  }
}

describe("MIA Core — Phase 2", () => {
  describe("ContextBuilder", () => {
    it("throws when tenant_id is empty", () => {
      expect(() =>
        buildContext({ tenantId: "", userId: "u1", origin: "chat", context: "vendazap", message: "hi" })
      ).toThrow("tenant_id é obrigatório");
    });

    it("throws when user_id is empty", () => {
      expect(() =>
        buildContext({ tenantId: "t1", userId: "", origin: "chat", context: "vendazap", message: "hi" })
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

  describe("MIAOrchestrator (with mock engines)", () => {
    it("routes to correct engine per context", async () => {
      const mia = getMIAOrchestrator();
      const types = ["vendazap", "dealroom", "onboarding", "commercial", "cashflow", "argument"] as const;
      for (const t of types) {
        mia.registerEngine(new MockEngine(t));
      }

      for (const ctx of types) {
        const response = await mia.handleRequest({
          tenantId: "t1", userId: "u1", message: "test", origin: "chat", context: ctx,
        });
        expect(response.engine).toBe(ctx);
        expect(response.message).toContain(`mock-${ctx}`);
        expect(response.type).toBe("text");
      }
    });

    it("generateResponse is alias for handleRequest", async () => {
      const mia = getMIAOrchestrator();
      mia.registerEngine(new MockEngine("vendazap"));

      const req = { tenantId: "t1", userId: "u1", message: "test", origin: "chat" as const, context: "vendazap" as const };
      const r1 = await mia.handleRequest(req);
      const r2 = await mia.generateResponse(req);
      expect(r1.engine).toBe(r2.engine);
      expect(r1.type).toBe(r2.type);
    });

    it("returns error when tenant_id is missing", async () => {
      const mia = getMIAOrchestrator();
      const response = await mia.handleRequest({
        tenantId: "", userId: "u1", message: "test", origin: "chat", context: "vendazap",
      });
      expect(response.error).toContain("tenant_id");
    });

    it("returns error when user_id is missing", async () => {
      const mia = getMIAOrchestrator();
      const response = await mia.handleRequest({
        tenantId: "t1", userId: "", message: "test", origin: "chat", context: "vendazap",
      });
      expect(response.error).toContain("user_id");
    });
  });

  describe("MIAAdapter", () => {
    it("auto-maps origin to context", async () => {
      const mia = getMIAOrchestrator();
      mia.registerEngine(new MockEngine("dealroom"));

      const response = await miaGenerateResponse({
        tenant_id: "t1", user_id: "u1", message: "test", origin: "dealroom",
      });
      expect(response.engine).toBe("dealroom");
    });

    it("uses explicit context over origin mapping", async () => {
      const mia = getMIAOrchestrator();
      mia.registerEngine(new MockEngine("cashflow"));

      const response = await miaGenerateResponse({
        tenant_id: "t1", user_id: "u1", message: "test", origin: "chat", context: "cashflow",
      });
      expect(response.engine).toBe("cashflow");
    });

    it("rejects empty tenant_id", async () => {
      const response = await miaGenerateResponse({
        tenant_id: "", user_id: "u1", message: "test", origin: "chat",
      });
      expect(response.error).toContain("tenant_id");
    });

    it("rejects empty user_id", async () => {
      const response = await miaGenerateResponse({
        tenant_id: "t1", user_id: "", message: "test", origin: "chat",
      });
      expect(response.error).toContain("user_id");
    });
  });
});
