export type BrDocumentKind = "CPF" | "CNPJ";

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function validCpf(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function validCnpj(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Normalizes and validates a Brazilian payer document. Returns null when invalid. */
export function parseBrDocument(input: string | undefined): { kind: BrDocumentKind; digits: string } | null {
  if (!input) return null;
  const d = digitsOnly(input);
  if (validCpf(d)) return { kind: "CPF", digits: d };
  if (validCnpj(d)) return { kind: "CNPJ", digits: d };
  return null;
}
