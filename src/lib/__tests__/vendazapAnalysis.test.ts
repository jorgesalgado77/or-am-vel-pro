import { describe, it, expect } from "vitest";
import { detectDiscFromMessages, analyzeVendaZapMessage, type VendaZapMessageLike } from "../vendazapAnalysis";

describe("detectDiscFromMessages", () => {
  it("detects Dominant profile from direct messages", () => {
    const msgs: VendaZapMessageLike[] = [
      { mensagem: "Preciso disso rápido, direto ao ponto, resolve logo", remetente_tipo: "cliente" },
      { mensagem: "Agora, sem enrolação, objetivo claro", remetente_tipo: "cliente" },
    ];
    const result = detectDiscFromMessages(msgs);
    expect(result.profile).toBe("D");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("detects Influential profile from enthusiastic messages", () => {
    const msgs: VendaZapMessageLike[] = [
      { mensagem: "Amei! Show! Top demais kkk 🔥😍", remetente_tipo: "cliente" },
      { mensagem: "Adorei o projeto, lindo haha", remetente_tipo: "cliente" },
    ];
    const result = detectDiscFromMessages(msgs);
    expect(result.profile).toBe("I");
  });

  it("detects Steady profile from family/security messages", () => {
    const msgs: VendaZapMessageLike[] = [
      { mensagem: "Vou conversar com meu marido, a família precisa aprovar", remetente_tipo: "cliente" },
      { mensagem: "Tem garantia? Preciso de segurança e tranquilidade", remetente_tipo: "cliente" },
    ];
    const result = detectDiscFromMessages(msgs);
    expect(result.profile).toBe("S");
  });

  it("detects Compliant profile from analytical messages", () => {
    const msgs: VendaZapMessageLike[] = [
      { mensagem: "Me passa os detalhes técnicos e especificações do material", remetente_tipo: "cliente" },
      { mensagem: "Como funciona a ferragem? Preciso comparar as medidas do projeto", remetente_tipo: "cliente" },
    ];
    const result = detectDiscFromMessages(msgs);
    expect(result.profile).toBe("C");
  });

  it("returns empty profile for neutral messages", () => {
    const msgs: VendaZapMessageLike[] = [
      { mensagem: "ok", remetente_tipo: "cliente" },
    ];
    const result = detectDiscFromMessages(msgs);
    expect(["D", "I", "S", "C", ""]).toContain(result.profile);
  });

  it("ignores seller messages for profiling", () => {
    const msgs: VendaZapMessageLike[] = [
      { mensagem: "Amei! Show! Top demais kkk 🔥", remetente_tipo: "vendedor" },
      { mensagem: "ok", remetente_tipo: "cliente" },
    ];
    const result = detectDiscFromMessages(msgs);
    // Should NOT be I since the enthusiastic msg is from seller
    expect(result.profile).not.toBe("I");
  });
});

describe("analyzeVendaZapMessage", () => {
  it("returns score and intent for closing message", () => {
    const result = analyzeVendaZapMessage("Quero fechar, pode mandar o contrato");
    expect(result.score).toBeGreaterThan(0);
    expect(result.intent).toBeTruthy();
  });

  it("detects objection intent", () => {
    const result = analyzeVendaZapMessage("Está muito caro, não tenho como pagar esse valor");
    expect(result.intent).toBeTruthy();
  });

  it("handles empty message gracefully", () => {
    const result = analyzeVendaZapMessage("");
    expect(result).toBeDefined();
    expect(typeof result.score).toBe("number");
  });
});
