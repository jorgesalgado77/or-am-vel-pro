import { startOfDay, endOfDay, startOfMonth, subDays, subMonths, isAfter, isBefore } from "date-fns";

export type DateFilterPreset = "mes_atual" | "30dias" | "60dias" | "90dias" | "6meses" | "personalizado";

export const DATE_FILTER_OPTIONS: { value: DateFilterPreset; label: string }[] = [
  { value: "mes_atual", label: "Mês Atual" },
  { value: "30dias", label: "Últimos 30 dias" },
  { value: "60dias", label: "Últimos 60 dias" },
  { value: "90dias", label: "Últimos 90 dias" },
  { value: "6meses", label: "Últimos 6 meses" },
  { value: "personalizado", label: "Personalizado" },
];

export function getDateRange(preset: DateFilterPreset, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = endOfDay(now);

  switch (preset) {
    case "mes_atual":
      return { start: startOfMonth(now), end };
    case "30dias":
      return { start: startOfDay(subDays(now, 30)), end };
    case "60dias":
      return { start: startOfDay(subDays(now, 60)), end };
    case "90dias":
      return { start: startOfDay(subDays(now, 90)), end };
    case "6meses":
      return { start: startOfDay(subMonths(now, 6)), end };
    case "personalizado":
      return {
        start: customStart ? startOfDay(new Date(customStart)) : startOfMonth(now),
        end: customEnd ? endOfDay(new Date(customEnd)) : end,
      };
    default:
      return { start: startOfMonth(now), end };
  }
}

export function isInRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return (isAfter(d, start) || d.getTime() === start.getTime()) && (isBefore(d, end) || d.getTime() === end.getTime());
}
