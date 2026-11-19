export function formatHs(code: string): string {
  const d = code.replace(/\D/g, "");
  if (d.length < 4) return d || code;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}
