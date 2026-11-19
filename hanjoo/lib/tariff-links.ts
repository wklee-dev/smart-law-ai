export function tariffCountry(raw: string | null | undefined): string {
  const code = (raw ?? "KR").trim().toUpperCase();
  return code || "KR";
}

export function isForeignCountry(code: string): boolean {
  return code !== "KR";
}

export function tariffHref(
  path: string,
  year: number,
  country: string,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams();
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  params.set("year", String(year));
  if (isForeignCountry(country)) params.set("country", country);
  return `${path}?${params.toString()}`;
}

export function tariffIndexHref(year: number, country: string): string {
  if (isForeignCountry(country)) return tariffHref("/tariff/foreign", year, country);
  return `/tariff?year=${year}`;
}
