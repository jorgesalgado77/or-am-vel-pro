import { describe, it, expect } from "vitest";
import { parseProjectFile, normalizeFinish } from "./fileImportService";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("normalizeFinish", () => {
  it("normalizes known finishes", () => {
    expect(normalizeFinish("BRISA")).toBe("Brisa");
    expect(normalizeFinish("NOGUEIRA AVENA")).toBe("Nogueira Avena");
    expect(normalizeFinish("NOG AVENA")).toBe("Nogueira Avena");
    expect(normalizeFinish("BRANCO AURA")).toBe("Branco Aura");
    expect(normalizeFinish("PRETO FOSCO")).toBe("Preto Fosco");
    expect(normalizeFinish("CINZA LISO FOSCO")).toBe("Cinza Liso Fosco");
  });

  it("title-cases unknown finishes", () => {
    expect(normalizeFinish("MOGNO ESCURO")).toBe("Mogno Escuro");
  });

  it("returns empty for empty input", () => {
    expect(normalizeFinish("")).toBe("");
  });
});

describe("parseProjectFile — Promob TXT (cozinha.txt)", () => {
  let content: string;
  try {
    content = readFileSync(resolve("/tmp/cozinha.txt"), "utf-8");
  } catch {
    content = "";
  }

  it("detects promob software", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.txt");
    expect(result.software).toBe("promob");
    expect(result.fileFormat).toBe("TXT");
  });

  it("extracts client name as environment", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.txt");
    expect(result.envName).toContain("ALINE PERES");
  });

  it("extracts total value", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.txt");
    expect(result.total).toBeCloseTo(29290.84, 1);
  });

  it("extracts individual modules", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.txt");
    expect(result.modules).toBeDefined();
    expect(result.modules!.length).toBeGreaterThan(10);

    const armarios = result.modules!.filter(m => m.type === "modulo");
    expect(armarios.length).toBeGreaterThan(0);
    expect(armarios[0].description).toContain("ARMARIO");

    const portas = result.modules!.filter(m => m.type === "porta");
    expect(portas.length).toBeGreaterThan(0);

    const acessorios = result.modules!.filter(m => m.type === "acessorio");
    expect(acessorios.length).toBeGreaterThan(0);
  });

  it("normalizes finishes on modules", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.txt");
    const brisaModules = result.modules!.filter(m => m.finish === "Brisa");
    expect(brisaModules.length).toBeGreaterThan(0);
  });

  it("derives corpo from modules", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.txt");
    expect(result.corpo).toBe("Brisa");
  });
});

describe("parseProjectFile — Promob XML (cozinha.xml)", () => {
  let content: string;
  try {
    content = readFileSync(resolve("/tmp/cozinha.xml"), "utf-8");
  } catch {
    content = "";
  }

  it("detects promob software", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    expect(result.software).toBe("promob");
    expect(result.fileFormat).toBe("XML");
  });

  it("extracts ambient description", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    expect(result.envName).toContain("SPIAGGIA");
  });

  it("extracts total from ORDER value", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    expect(result.total).toBeCloseTo(29290.84, 1);
  });

  it("extracts supplier", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    expect(result.fornecedor).toBe("Criare");
  });

  it("extracts individual modules with types", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    expect(result.modules).toBeDefined();
    expect(result.modules!.length).toBeGreaterThan(10);

    const modulos = result.modules!.filter(m => m.type === "modulo");
    expect(modulos.length).toBeGreaterThan(0);

    const portas = result.modules!.filter(m => m.type === "porta");
    expect(portas.length).toBeGreaterThan(0);
  });

  it("normalizes acabamentos from XML ACAB references", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    const finishes = new Set(result.modules!.map(m => m.finish).filter(Boolean));
    expect(finishes.has("Brisa")).toBe(true);
    expect(finishes.has("Nogueira Avena")).toBe(true);
  });

  it("extracts supplier per module", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    const withSupplier = result.modules!.filter(m => m.supplier);
    expect(withSupplier.length).toBeGreaterThan(0);
    expect(withSupplier[0].supplier).toBe("Criare");
  });

  it("derives corpo and porta from module finishes", () => {
    if (!content) return;
    const result = parseProjectFile(content, "cozinha.xml");
    expect(result.corpo).toBeTruthy();
    expect(result.porta).toBeTruthy();
  });
});
