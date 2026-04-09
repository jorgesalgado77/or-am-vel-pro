/**
 * Simple Excel-like formula engine for table cells.
 * Supports: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, IF, ROUND, ABS, CONCATENATE, UPPER, LOWER, LEN, LEFT, RIGHT, MID, TRIM, TODAY, NOW
 */

// Convert column letter(s) to 0-based index: A→0, B→1, Z→25, AA→26
function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// Parse cell reference like "A1" → { col: 0, row: 0 }
function parseRef(ref: string): { col: number; row: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

// Parse range like "A1:C3" → array of { col, row }
function parseRange(range: string): { col: number; row: number }[] {
  const [start, end] = range.split(":");
  const s = parseRef(start);
  const e = end ? parseRef(end) : s;
  if (!s || !e) return [];
  const cells: { col: number; row: number }[] = [];
  for (let r = Math.min(s.row, e.row); r <= Math.max(s.row, e.row); r++) {
    for (let c = Math.min(s.col, e.col); c <= Math.max(s.col, e.col); c++) {
      cells.push({ col: c, row: r });
    }
  }
  return cells;
}

// Get numeric values from a range
function getValues(data: string[][], rangeStr: string): number[] {
  const cells = parseRange(rangeStr);
  return cells
    .map(c => data[c.row]?.[c.col])
    .filter(v => v !== undefined && v !== "")
    .map(v => parseFloat(String(v).replace(/[R$\s.]/g, "").replace(",", ".")))
    .filter(v => !isNaN(v));
}

function getStringValues(data: string[][], rangeStr: string): string[] {
  const cells = parseRange(rangeStr);
  return cells.map(c => data[c.row]?.[c.col] ?? "");
}

function getCellValue(data: string[][], ref: string): string {
  const p = parseRef(ref);
  if (!p) return ref;
  return data[p.row]?.[p.col] ?? "";
}

// Split function arguments respecting nested parentheses
function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of argsStr) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// Match a cell value against a criteria string (supports ">5", "<10", ">=3", "<>0", "text", "*wild*")
function matchesCriteria(cellVal: string, criteria: string, data: string[][]): boolean {
  const ops = [">=", "<=", "<>", "!=", ">", "<", "="];
  for (const op of ops) {
    if (criteria.startsWith(op)) {
      const right = criteria.substring(op.length);
      const lNum = parseFloat(cellVal.replace(/[R$\s.]/g, "").replace(",", "."));
      const rNum = parseFloat(right.replace(",", "."));
      const useNum = !isNaN(lNum) && !isNaN(rNum);
      switch (op) {
        case ">=": return useNum ? lNum >= rNum : cellVal >= right;
        case "<=": return useNum ? lNum <= rNum : cellVal <= right;
        case "<>": case "!=": return cellVal !== right;
        case ">": return useNum ? lNum > rNum : cellVal > right;
        case "<": return useNum ? lNum < rNum : cellVal < right;
        case "=": return cellVal.toUpperCase() === right.toUpperCase();
      }
    }
  }
  // Wildcard support
  if (criteria.includes("*") || criteria.includes("?")) {
    const regex = new RegExp("^" + criteria.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    return regex.test(cellVal);
  }
  return cellVal.toUpperCase() === criteria.toUpperCase();
}

// Evaluate a formula expression
function evalExpr(expr: string, data: string[][]): string {
  const trimmed = expr.trim();

  // String literal
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  // Number literal
  const num = parseFloat(trimmed.replace(",", "."));
  if (!isNaN(num) && /^-?\d+([.,]\d+)?$/.test(trimmed)) {
    return String(num);
  }

  // Cell reference
  if (/^[A-Z]+\d+$/.test(trimmed)) {
    const val = getCellValue(data, trimmed);
    return val;
  }

  // Function call
  const fnMatch = trimmed.match(/^([A-Z_]+)\((.+)\)$/s);
  if (fnMatch) {
    const fn = fnMatch[1];
    const argsStr = fnMatch[2];
    const args = splitArgs(argsStr);

    switch (fn) {
      case "SUM": {
        const vals = args.flatMap(a => a.includes(":") ? getValues(data, a) : [parseFloat(evalExpr(a, data).replace(",", "."))]).filter(v => !isNaN(v));
        return String(vals.reduce((s, v) => s + v, 0));
      }
      case "AVERAGE":
      case "MEDIA": {
        const vals = args.flatMap(a => a.includes(":") ? getValues(data, a) : [parseFloat(evalExpr(a, data).replace(",", "."))]).filter(v => !isNaN(v));
        return vals.length ? String(vals.reduce((s, v) => s + v, 0) / vals.length) : "0";
      }
      case "COUNT":
      case "CONT.NÚM":
      case "CONTAR": {
        const vals = args.flatMap(a => a.includes(":") ? getValues(data, a) : [parseFloat(evalExpr(a, data).replace(",", "."))]).filter(v => !isNaN(v));
        return String(vals.length);
      }
      case "COUNTA":
      case "CONT.VALORES": {
        const vals = args.flatMap(a => a.includes(":") ? getStringValues(data, a) : [evalExpr(a, data)]).filter(v => v !== "");
        return String(vals.length);
      }
      case "MIN":
      case "MÍNIMO": {
        const vals = args.flatMap(a => a.includes(":") ? getValues(data, a) : [parseFloat(evalExpr(a, data).replace(",", "."))]).filter(v => !isNaN(v));
        return vals.length ? String(Math.min(...vals)) : "0";
      }
      case "MAX":
      case "MÁXIMO": {
        const vals = args.flatMap(a => a.includes(":") ? getValues(data, a) : [parseFloat(evalExpr(a, data).replace(",", "."))]).filter(v => !isNaN(v));
        return vals.length ? String(Math.max(...vals)) : "0";
      }
      case "IF":
      case "SE": {
        if (args.length < 3) return "#ERRO";
        const condition = evalCondition(args[0], data);
        return condition ? evalExpr(args[1], data) : evalExpr(args[2], data);
      }
      case "ROUND":
      case "ARRED": {
        const val = parseFloat(evalExpr(args[0], data).replace(",", "."));
        const decimals = args[1] ? parseInt(evalExpr(args[1], data)) : 0;
        return isNaN(val) ? "#ERRO" : val.toFixed(decimals);
      }
      case "ABS": {
        const val = parseFloat(evalExpr(args[0], data).replace(",", "."));
        return isNaN(val) ? "#ERRO" : String(Math.abs(val));
      }
      case "CONCATENATE":
      case "CONCATENAR": {
        return args.map(a => evalExpr(a, data)).join("");
      }
      case "UPPER":
      case "MAIÚSCULA": {
        return evalExpr(args[0], data).toUpperCase();
      }
      case "LOWER":
      case "MINÚSCULA": {
        return evalExpr(args[0], data).toLowerCase();
      }
      case "LEN":
      case "NÚM.CARACT": {
        return String(evalExpr(args[0], data).length);
      }
      case "LEFT":
      case "ESQUERDA": {
        const str = evalExpr(args[0], data);
        const n = args[1] ? parseInt(evalExpr(args[1], data)) : 1;
        return str.substring(0, n);
      }
      case "RIGHT":
      case "DIREITA": {
        const str = evalExpr(args[0], data);
        const n = args[1] ? parseInt(evalExpr(args[1], data)) : 1;
        return str.substring(str.length - n);
      }
      case "MID":
      case "EXT.TEXTO": {
        const str = evalExpr(args[0], data);
        const start = parseInt(evalExpr(args[1], data)) - 1;
        const len = parseInt(evalExpr(args[2], data));
        return str.substring(start, start + len);
      }
      case "TRIM":
      case "ARRUMAR": {
        return evalExpr(args[0], data).trim();
      }
      case "TODAY":
      case "HOJE": {
        return new Date().toLocaleDateString("pt-BR");
      }
      case "NOW":
      case "AGORA": {
        return new Date().toLocaleString("pt-BR");
      }
      case "POWER":
      case "POTÊNCIA": {
        const base = parseFloat(evalExpr(args[0], data).replace(",", "."));
        const exp = parseFloat(evalExpr(args[1], data).replace(",", "."));
        return isNaN(base) || isNaN(exp) ? "#ERRO" : String(Math.pow(base, exp));
      }
      case "SQRT":
      case "RAIZ": {
        const val = parseFloat(evalExpr(args[0], data).replace(",", "."));
        return isNaN(val) || val < 0 ? "#ERRO" : String(Math.sqrt(val));
      }
      case "INT":
      case "INTEIRO": {
        const val = parseFloat(evalExpr(args[0], data).replace(",", "."));
        return isNaN(val) ? "#ERRO" : String(Math.floor(val));
      }
      case "MOD":
      case "RESTO": {
        const a = parseFloat(evalExpr(args[0], data).replace(",", "."));
        const b = parseFloat(evalExpr(args[1], data).replace(",", "."));
        return isNaN(a) || isNaN(b) || b === 0 ? "#ERRO" : String(a % b);
      }
      case "SUMIF":
      case "SOMASE": {
        // SUMIF(range; criteria; [sum_range])
        if (args.length < 2) return "#ERRO";
        const criteriaCells = parseRange(args[0]);
        const criteria = evalExpr(args[1], data);
        const sumCells = args[2] ? parseRange(args[2]) : criteriaCells;
        let total = 0;
        for (let i = 0; i < criteriaCells.length; i++) {
          const cellVal = data[criteriaCells[i].row]?.[criteriaCells[i].col] ?? "";
          if (matchesCriteria(cellVal, criteria, data)) {
            const sv = sumCells[i] ? (data[sumCells[i].row]?.[sumCells[i].col] ?? "") : "";
            const n = parseFloat(String(sv).replace(/[R$\s.]/g, "").replace(",", "."));
            if (!isNaN(n)) total += n;
          }
        }
        return String(total);
      }
      case "COUNTIF":
      case "CONT.SE": {
        // COUNTIF(range; criteria)
        if (args.length < 2) return "#ERRO";
        const cells = parseRange(args[0]);
        const crit = evalExpr(args[1], data);
        let count = 0;
        for (const c of cells) {
          const cellVal = data[c.row]?.[c.col] ?? "";
          if (matchesCriteria(cellVal, crit, data)) count++;
        }
        return String(count);
      }
      case "SUMIFS":
      case "SOMASES": {
        // SUMIFS(sum_range; criteria_range1; criteria1; ...)
        if (args.length < 3 || args.length % 2 === 0) return "#ERRO";
        const sumRange = parseRange(args[0]);
        const pairs: { range: { col: number; row: number }[]; criteria: string }[] = [];
        for (let i = 1; i < args.length; i += 2) {
          pairs.push({ range: parseRange(args[i]), criteria: evalExpr(args[i + 1], data) });
        }
        let sum = 0;
        for (let i = 0; i < sumRange.length; i++) {
          const allMatch = pairs.every(p => {
            const cv = data[p.range[i]?.row]?.[p.range[i]?.col] ?? "";
            return matchesCriteria(cv, p.criteria, data);
          });
          if (allMatch) {
            const sv = data[sumRange[i].row]?.[sumRange[i].col] ?? "";
            const n = parseFloat(String(sv).replace(/[R$\s.]/g, "").replace(",", "."));
            if (!isNaN(n)) sum += n;
          }
        }
        return String(sum);
      }
      case "COUNTIFS":
      case "CONT.SES": {
        // COUNTIFS(range1; criteria1; range2; criteria2; ...)
        if (args.length < 2 || args.length % 2 !== 0) return "#ERRO";
        const pairs2: { range: { col: number; row: number }[]; criteria: string }[] = [];
        for (let i = 0; i < args.length; i += 2) {
          pairs2.push({ range: parseRange(args[i]), criteria: evalExpr(args[i + 1], data) });
        }
        const len = pairs2[0].range.length;
        let cnt = 0;
        for (let i = 0; i < len; i++) {
          const allMatch = pairs2.every(p => {
            const cv = data[p.range[i]?.row]?.[p.range[i]?.col] ?? "";
            return matchesCriteria(cv, p.criteria, data);
          });
          if (allMatch) cnt++;
        }
        return String(cnt);
      }
      case "AVERAGEIF":
      case "MÉDIASE": {
        if (args.length < 2) return "#ERRO";
        const aCells = parseRange(args[0]);
        const aCrit = evalExpr(args[1], data);
        const aSum = args[2] ? parseRange(args[2]) : aCells;
        let aTotal = 0, aCount = 0;
        for (let i = 0; i < aCells.length; i++) {
          const cv = data[aCells[i].row]?.[aCells[i].col] ?? "";
          if (matchesCriteria(cv, aCrit, data)) {
            const sv = aSum[i] ? (data[aSum[i].row]?.[aSum[i].col] ?? "") : "";
            const n = parseFloat(String(sv).replace(/[R$\s.]/g, "").replace(",", "."));
            if (!isNaN(n)) { aTotal += n; aCount++; }
          }
        }
        return aCount ? String(aTotal / aCount) : "0";
      }
      case "VLOOKUP":
      case "PROCV": {
        // VLOOKUP(lookup_value; table_range; col_index; [approx_match])
        if (args.length < 3) return "#ERRO";
        const lookupVal = evalExpr(args[0], data);
        const tableRange = args[1];
        const colIdx = parseInt(evalExpr(args[2], data));
        const approx = args[3] ? evalExpr(args[3], data).toUpperCase() !== "0" && evalExpr(args[3], data).toUpperCase() !== "FALSO" && evalExpr(args[3], data).toUpperCase() !== "FALSE" : true;
        
        const [tStart, tEnd] = tableRange.split(":");
        const ts = parseRef(tStart);
        const te = tEnd ? parseRef(tEnd) : ts;
        if (!ts || !te) return "#ERRO";
        if (colIdx < 1 || colIdx > (te.col - ts.col + 1)) return "#REF!";
        
        const lookupNum = parseFloat(lookupVal.replace(/[R$\s.]/g, "").replace(",", "."));
        let bestRow = -1;
        
        for (let r = ts.row; r <= te.row; r++) {
          const cv = data[r]?.[ts.col] ?? "";
          if (!approx) {
            if (cv.toUpperCase() === lookupVal.toUpperCase()) { bestRow = r; break; }
          } else {
            const cn = parseFloat(cv.replace(/[R$\s.]/g, "").replace(",", "."));
            if (!isNaN(cn) && !isNaN(lookupNum) && cn <= lookupNum) bestRow = r;
            else if (cv.toUpperCase() <= lookupVal.toUpperCase()) bestRow = r;
          }
        }
        if (bestRow === -1) return "#N/D";
        return data[bestRow]?.[ts.col + colIdx - 1] ?? "";
      }
      case "HLOOKUP":
      case "PROCH": {
        if (args.length < 3) return "#ERRO";
        const hVal = evalExpr(args[0], data);
        const [hStart, hEnd] = args[1].split(":");
        const hs = parseRef(hStart);
        const he = hEnd ? parseRef(hEnd) : hs;
        if (!hs || !he) return "#ERRO";
        const rowIdx = parseInt(evalExpr(args[2], data));
        if (rowIdx < 1 || rowIdx > (he.row - hs.row + 1)) return "#REF!";
        
        for (let c = hs.col; c <= he.col; c++) {
          const cv = data[hs.row]?.[c] ?? "";
          if (cv.toUpperCase() === hVal.toUpperCase()) {
            return data[hs.row + rowIdx - 1]?.[c] ?? "";
          }
        }
        return "#N/D";
      }
      case "IFERROR":
      case "SEERRO": {
        const result = evalExpr(args[0], data);
        return result.startsWith("#") ? evalExpr(args[1], data) : result;
      }
      default:
        return `#FUNC?(${fn})`;
    }
  }

  // Simple arithmetic: try basic eval for +,-,*,/
  try {
    // Replace cell references with values
    const resolved = trimmed.replace(/[A-Z]+\d+/g, (ref) => {
      const val = getCellValue(data, ref);
      const n = parseFloat(val.replace(/[R$\s.]/g, "").replace(",", "."));
      return isNaN(n) ? "0" : String(n);
    });
    // Safe eval for basic math only
    if (/^[\d\s+\-*/().]+$/.test(resolved)) {
      const result = Function(`"use strict"; return (${resolved})`)();
      return String(result);
    }
  } catch { }

  return trimmed;
}

function evalCondition(condStr: string, data: string[][]): boolean {
  const ops = [">=", "<=", "<>", "!=", "=", ">", "<"];
  for (const op of ops) {
    const idx = condStr.indexOf(op);
    if (idx >= 0) {
      const left = evalExpr(condStr.substring(0, idx), data);
      const right = evalExpr(condStr.substring(idx + op.length), data);
      const lNum = parseFloat(left.replace(",", "."));
      const rNum = parseFloat(right.replace(",", "."));
      const useNum = !isNaN(lNum) && !isNaN(rNum);
      switch (op) {
        case ">=": return useNum ? lNum >= rNum : left >= right;
        case "<=": return useNum ? lNum <= rNum : left <= right;
        case "<>": case "!=": return left !== right;
        case "=": return left === right;
        case ">": return useNum ? lNum > rNum : left > right;
        case "<": return useNum ? lNum < rNum : left < right;
      }
    }
  }
  return false;
}

/**
 * Evaluate a cell value. If it starts with "=", treat as formula.
 */
export function evaluateCell(value: string, data: string[][]): string {
  if (!value.startsWith("=")) return value;
  try {
    return evalExpr(value.substring(1).trim().toUpperCase(), data);
  } catch {
    return "#ERRO";
  }
}

/**
 * Check if a value is a formula
 */
export function isFormula(value: string): boolean {
  return value.startsWith("=");
}

/**
 * List of supported formulas for autocomplete
 */
export const SUPPORTED_FORMULAS = [
  { name: "SUM", syntax: "SUM(A1:A10)", desc: "Soma os valores do intervalo" },
  { name: "AVERAGE", syntax: "AVERAGE(A1:A10)", desc: "Calcula a média" },
  { name: "COUNT", syntax: "COUNT(A1:A10)", desc: "Conta células com números" },
  { name: "COUNTA", syntax: "COUNTA(A1:A10)", desc: "Conta células não vazias" },
  { name: "MIN", syntax: "MIN(A1:A10)", desc: "Retorna o menor valor" },
  { name: "MAX", syntax: "MAX(A1:A10)", desc: "Retorna o maior valor" },
  { name: "IF", syntax: "IF(A1>10;\"Sim\";\"Não\")", desc: "Condicional SE" },
  { name: "IFERROR", syntax: "IFERROR(A1/B1;0)", desc: "Retorna valor alternativo se erro" },
  { name: "SUMIF", syntax: "SUMIF(A1:A10;\">5\";B1:B10)", desc: "Soma condicional" },
  { name: "COUNTIF", syntax: "COUNTIF(A1:A10;\">5\")", desc: "Contagem condicional" },
  { name: "SUMIFS", syntax: "SUMIFS(C1:C10;A1:A10;\">5\";B1:B10;\"<10\")", desc: "Soma com múltiplas condições" },
  { name: "COUNTIFS", syntax: "COUNTIFS(A1:A10;\">5\";B1:B10;\"<10\")", desc: "Contagem com múltiplas condições" },
  { name: "AVERAGEIF", syntax: "AVERAGEIF(A1:A10;\">5\";B1:B10)", desc: "Média condicional" },
  { name: "VLOOKUP", syntax: "VLOOKUP(A1;B1:D10;3;0)", desc: "Busca vertical (PROCV)" },
  { name: "HLOOKUP", syntax: "HLOOKUP(A1;A1:D4;3;0)", desc: "Busca horizontal (PROCH)" },
  { name: "ROUND", syntax: "ROUND(A1;2)", desc: "Arredonda valor" },
  { name: "ABS", syntax: "ABS(A1)", desc: "Valor absoluto" },
  { name: "CONCATENATE", syntax: "CONCATENATE(A1;B1)", desc: "Junta textos" },
  { name: "UPPER", syntax: "UPPER(A1)", desc: "Converte para maiúsculas" },
  { name: "LOWER", syntax: "LOWER(A1)", desc: "Converte para minúsculas" },
  { name: "LEN", syntax: "LEN(A1)", desc: "Conta caracteres" },
  { name: "LEFT", syntax: "LEFT(A1;3)", desc: "Primeiros N caracteres" },
  { name: "RIGHT", syntax: "RIGHT(A1;3)", desc: "Últimos N caracteres" },
  { name: "MID", syntax: "MID(A1;2;3)", desc: "Trecho do texto" },
  { name: "TRIM", syntax: "TRIM(A1)", desc: "Remove espaços extras" },
  { name: "TODAY", syntax: "TODAY()", desc: "Data de hoje" },
  { name: "NOW", syntax: "NOW()", desc: "Data e hora atual" },
  { name: "SQRT", syntax: "SQRT(A1)", desc: "Raiz quadrada" },
  { name: "POWER", syntax: "POWER(A1;2)", desc: "Potência" },
  { name: "INT", syntax: "INT(A1)", desc: "Parte inteira" },
  { name: "MOD", syntax: "MOD(A1;3)", desc: "Resto da divisão" },
];

// Convert 0-based col index to letter: 0→A, 25→Z, 26→AA
export function indexToCol(idx: number): string {
  let col = "";
  let n = idx;
  while (n >= 0) {
    col = String.fromCharCode(65 + (n % 26)) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}
