export function amount(value: string | null): string {
  if (value === null) return "••••";
  const [whole, fraction] = value.split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (fraction === undefined ? "" : `.${fraction}`)
  );
}
export function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  const n = Math.max(0, Math.floor(seconds));
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function parseAmount(input: string): string {
  const value = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/.test(value))
    throw new Error("INVALID_SALARY");
  const normalized = value.replaceAll(",", "");
  if (Number(normalized) <= 0 || Number(normalized) > 1_000_000_000)
    throw new Error("INVALID_SALARY");
  return normalized;
}
