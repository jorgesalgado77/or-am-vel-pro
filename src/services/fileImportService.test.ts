import { describe, it, expect } from "vitest";
import { parseProjectFile, normalizeFinish } from "./fileImportService";

// ── Inline sample data (based on real Promob exports) ──────────────

const SAMPLE_PROMOB_TXT = `
ID do Projeto = 12345
Cliente = ALINE PERES
Total = 29.290,84

Seq  Qtd    Codigo      Descricao                                       Vlr Unit   Vlr Total   Dimensao
1    3      820227748   ARMARIO L1000 H700 P530 BRISA                   349.48     1048.43     1000 x 700 x 530
2    2      820227749   ARMARIO L600 H2400 P530 NOGUEIRA AVENA          512.00     1024.00     600 x 2400 x 530
3    4      830112233   PORTA L498 H696 BRISA                           89.50      358.00      498 x 696 x 18
4    1      830112234   FRENTE GAVETA L560 H180 PRETO FOSCO             65.30      65.30       560 x 180 x 18
5    6      850998877   DOBRADICA 35MM CLIP                             12.50      75.00       0 x 0 x 0
6    2      850998878   PUXADOR RETO 160MM PRETO                        25.00      50.00       160 x 0 x 0
7    1      820333444   BALCAO L800 H900 P600 BRISA                     420.00     420.00      800 x 900 x 600
8    3      850111222   TRILHO TELESCOPICO 450MM                        38.00      114.00      450 x 0 x 0
9    2      820555666   PAINEL LATERAL H2400 P530 BRISA                 180.00     360.00      530 x 2400 x 18
`;

const SAMPLE_PROMOB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<PROMOBFILE VERSION="5.0">
  <ABOUTPROMOB SYSTEM="Promob Plus 2024"/>
  <AMBIENTS>
    <AMBIENT DESCRIPTION="Cozinha SPIAGGIA" ID="1">
      <CATEGORIES>
        <CATEGORY DESCRIPTION="Cozinha">
          <ITEM DESCRIPTION="ARMARIO L1000 H700 P530" REFERENCE="820227748" QUANTITY="3" TEXTDIMENSION="1000 x 700 x 530" FAMILY="Aereo" GROUP="Modular" COMPONENT="N">
            <PRICE TABLE="1048.43" UNIT="349.48" TOTAL="1048.43"/>
            <ORDER UNIT="320.00" TOTAL="960.00"/>
            <REFERENCES>
              <ACAB REFERENCE="BRISA"/>
              <FORNECEDOR REFERENCE="Criare"/>
            </REFERENCES>
          </ITEM>
          <ITEM DESCRIPTION="ARMARIO L600 H2400 P530" REFERENCE="820227749" QUANTITY="2" TEXTDIMENSION="600 x 2400 x 530" FAMILY="Torre" GROUP="Modular" COMPONENT="N">
            <PRICE TABLE="1024.00" UNIT="512.00" TOTAL="1024.00"/>
            <ORDER UNIT="480.00" TOTAL="960.00"/>
            <REFERENCES>
              <ACAB REFERENCE="NOGUEIRA AVENA"/>
              <FORNECEDOR REFERENCE="Criare"/>
            </REFERENCES>
          </ITEM>
          <ITEM DESCRIPTION="PORTA L498 H696" REFERENCE="830112233" QUANTITY="4" TEXTDIMENSION="498 x 696 x 18" FAMILY="Porta" GROUP="Componente" COMPONENT="N">
            <PRICE TABLE="358.00" UNIT="89.50" TOTAL="358.00"/>
            <ORDER UNIT="75.00" TOTAL="300.00"/>
            <REFERENCES>
              <ACAB REFERENCE="BRISA"/>
              <FORNECEDOR REFERENCE="Criare"/>
            </REFERENCES>
          </ITEM>
          <ITEM DESCRIPTION="FRENTE GAVETA L560 H180" REFERENCE="830112234" QUANTITY="1" TEXTDIMENSION="560 x 180 x 18" FAMILY="Frente" GROUP="Componente" COMPONENT="N">
            <PRICE TABLE="65.30" UNIT="65.30" TOTAL="65.30"/>
            <ORDER UNIT="55.00" TOTAL="55.00"/>
            <REFERENCES>
              <ACAB REFERENCE="PRETO FOSCO"/>
              <FORNECEDOR REFERENCE="Criare"/>
            </REFERENCES>
          </ITEM>
          <ITEM DESCRIPTION="DOBRADICA 35MM CLIP" REFERENCE="850998877" QUANTITY="6" TEXTDIMENSION="" FAMILY="Ferragem" GROUP="Acessorio" COMPONENT="N">
            <PRICE TABLE="75.00" UNIT="12.50" TOTAL="75.00"/>
            <ORDER UNIT="10.00" TOTAL="60.00"/>
            <REFERENCES>
              <FORNECEDOR REFERENCE="Criare"/>
            </REFERENCES>
          </ITEM>
          <ITEM DESCRIPTION="PUXADOR RETO 160MM PRETO" REFERENCE="850998878" QUANTITY="2" TEXTDIMENSION="160 x 0 x 0" FAMILY="Puxador" GROUP="Acessorio" COMPONENT="N">
            <PRICE TABLE="50.00" UNIT="25.00" TOTAL="50.00"/>
            <ORDER UNIT="20.00" TOTAL="40.00"/>
            <REFERENCES>
              <FORNECEDOR REFERENCE="Criare"/>
            </REFERENCES>
          </ITEM>
          <ITEM DESCRIPTION="Structural sub-part" REFERENCE="999" QUANTITY="1" TEXTDIMENSION="" FAMILY="" GROUP="" COMPONENT="Y">
            <PRICE TABLE="0" UNIT="0" TOTAL="0"/>
          </ITEM>
        </CATEGORY>
      </CATEGORIES>
    </AMBIENT>
  </AMBIENTS>
  <TOTALPRICES TABLE="2620.73">
    <ORDER VALUE="2375.00">
  </TOTALPRICES>
</PROMOBFILE>`;

// ── normalizeFinish ────────────────────────────────────────────────

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

// ── Promob TXT ─────────────────────────────────────────────────────

describe("parseProjectFile — Promob TXT", () => {
  const result = parseProjectFile(SAMPLE_PROMOB_TXT, "cozinha.txt");

  it("detects promob software and TXT format", () => {
    expect(result.software).toBe("promob");
    expect(result.fileFormat).toBe("TXT");
  });

  it("extracts client name as environment", () => {
    expect(result.envName).toContain("ALINE PERES");
  });

  it("extracts total value", () => {
    expect(result.total).toBeCloseTo(29290.84, 1);
  });

  it("extracts individual modules", () => {
    expect(result.modules).toBeDefined();
    expect(result.modules!.length).toBeGreaterThanOrEqual(8);
  });

  it("classifies module types correctly", () => {
    const types = new Set(result.modules!.map(m => m.type));
    expect(types.has("modulo")).toBe(true);   // ARMARIO, BALCAO
    expect(types.has("porta")).toBe(true);     // PORTA
    expect(types.has("acessorio")).toBe(true); // DOBRADICA, PUXADOR, TRILHO
  });

  it("classifies BALCAO as modulo", () => {
    const balcao = result.modules!.find(m => m.description.includes("BALCAO"));
    expect(balcao).toBeDefined();
    expect(balcao!.type).toBe("modulo");
  });

  it("classifies PAINEL as painel", () => {
    const painel = result.modules!.find(m => m.description.includes("PAINEL"));
    expect(painel).toBeDefined();
    expect(painel!.type).toBe("painel");
  });

  it("normalizes finishes on modules", () => {
    const brisaModules = result.modules!.filter(m => m.finish === "Brisa");
    expect(brisaModules.length).toBeGreaterThan(0);
  });

  it("extracts quantities correctly", () => {
    const armario = result.modules!.find(m => m.code === "820227748");
    expect(armario).toBeDefined();
    expect(armario!.quantity).toBe(3);
    expect(armario!.unitPrice).toBeCloseTo(349.48, 1);
    expect(armario!.totalPrice).toBeCloseTo(1048.43, 1);
  });

  it("extracts dimensions", () => {
    const armario = result.modules!.find(m => m.code === "820227748");
    expect(armario!.dimensions).toContain("1000");
    expect(armario!.dimensions).toContain("700");
  });

  it("derives corpo from first modulo finish", () => {
    expect(result.corpo).toBe("Brisa");
  });

  it("derives porta from porta/frente modules", () => {
    expect(result.porta).toBeTruthy();
  });

  it("derives puxador from PUXADOR module", () => {
    expect(result.puxador).toContain("PUXADOR");
  });

  it("derives complemento from accessories", () => {
    expect(result.complemento).toContain("Dobradiças");
  });

  it("counts total pieces", () => {
    // 3+2+4+1+6+2+1+3+2 = 24
    expect(result.pieces).toBe(24);
  });
});

// ── Promob XML ─────────────────────────────────────────────────────

describe("parseProjectFile — Promob XML", () => {
  const result = parseProjectFile(SAMPLE_PROMOB_XML, "cozinha.xml");

  it("detects promob software and XML format", () => {
    expect(result.software).toBe("promob");
    expect(result.fileFormat).toBe("XML");
  });

  it("extracts ambient description", () => {
    expect(result.envName).toContain("SPIAGGIA");
  });

  it("extracts total from ORDER value", () => {
    expect(result.total).toBeCloseTo(2375.0, 1);
  });

  it("extracts supplier", () => {
    expect(result.fornecedor).toBe("Criare");
  });

  it("extracts modules excluding COMPONENT=Y items", () => {
    expect(result.modules).toBeDefined();
    expect(result.modules!.length).toBe(6); // 7 items - 1 COMPONENT=Y
    const componentItem = result.modules!.find(m => m.description === "Structural sub-part");
    expect(componentItem).toBeUndefined();
  });

  it("classifies module types from XML", () => {
    const modulos = result.modules!.filter(m => m.type === "modulo");
    const portas = result.modules!.filter(m => m.type === "porta");
    const frentes = result.modules!.filter(m => m.type === "frente");
    const acessorios = result.modules!.filter(m => m.type === "acessorio");
    expect(modulos.length).toBe(2);
    expect(portas.length).toBe(1);
    expect(frentes.length).toBe(1);
    expect(acessorios.length).toBe(2);
  });

  it("normalizes acabamentos from ACAB references", () => {
    const finishes = new Set(result.modules!.map(m => m.finish).filter(Boolean));
    expect(finishes.has("Brisa")).toBe(true);
    expect(finishes.has("Nogueira Avena")).toBe(true);
    expect(finishes.has("Preto Fosco")).toBe(true);
  });

  it("uses ORDER prices when available", () => {
    const armario = result.modules!.find(m => m.code === "820227748");
    expect(armario).toBeDefined();
    expect(armario!.unitPrice).toBeCloseTo(320.0, 1);
    expect(armario!.totalPrice).toBeCloseTo(960.0, 1);
  });

  it("extracts supplier per module", () => {
    const withSupplier = result.modules!.filter(m => m.supplier);
    expect(withSupplier.length).toBe(6);
    expect(withSupplier[0].supplier).toBe("Criare");
  });

  it("derives corpo from first modulo finish", () => {
    expect(result.corpo).toBe("Brisa");
  });

  it("derives porta from porta/frente finish", () => {
    expect(result.porta).toBe("Brisa");
  });

  it("extracts category and group from XML attributes", () => {
    const armario = result.modules!.find(m => m.code === "820227748");
    expect(armario!.category).toBe("Aereo");
    expect(armario!.group).toBe("Modular");
  });

  it("counts pieces correctly", () => {
    // 3+2+4+1+6+2 = 18 (excluding COMPONENT=Y)
    expect(result.pieces).toBe(18);
  });
});

// ── Fallback / Generic ─────────────────────────────────────────────

describe("parseProjectFile — Fallback", () => {
  it("handles generic TXT without crashing", () => {
    const result = parseProjectFile("Ambiente = Sala\nTotal = 5.000,00\nPeças = 12", "sala.txt");
    expect(result.software).toBe("generico");
    expect(result.envName).toContain("Sala");
    expect(result.total).toBeCloseTo(5000, 0);
  });

  it("handles empty content gracefully", () => {
    const result = parseProjectFile("", "vazio.txt");
    expect(result.envName).toBe("vazio");
    expect(result.total).toBeNull();
    expect(result.pieces).toBe(0);
  });

  it("handles .promob extension as XML", () => {
    const result = parseProjectFile(SAMPLE_PROMOB_XML, "projeto.promob");
    expect(result.software).toBe("promob");
    expect(result.fileFormat).toBe("PROMOB");
    expect(result.modules!.length).toBe(6);
  });
});
