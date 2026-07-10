// Deterministic, template-based explanations (§7). No LLM call, ever.
// Offline-safe: same input always yields the same string.

import { toHHMM } from "./time.ts";

/**
 * Explanation for a moved appointment.
 * @param oldStart original service start (minutes)
 * @param newStart new service start (minutes)
 * @param gapFrom  minutes marking the start of the gap being closed (e.g. previous occ_end)
 * @param gapTo    minutes marking the end of the gap being closed (e.g. new start)
 */
export function explainMove(
  oldStart: number,
  newStart: number,
  gapFrom: number | null,
  gapTo: number | null,
): string {
  const delta = Math.abs(oldStart - newStart);
  const verb = newStart < oldStart ? "Anticipato" : "Posticipato";
  if (gapFrom != null && gapTo != null && gapTo > gapFrom) {
    return `${verb} di ${delta} min per chiudere il buco tra le ${
      toHHMM(gapFrom)
    } e le ${toHHMM(gapTo)}.`;
  }
  return `${verb} di ${delta} min per ridurre il tempo morto.`;
}

/** Explanation for an appointment created from the waiting list. */
export function explainCreate(priority: string): string {
  const label = priority === "high"
    ? "priorità alta"
    : priority === "low"
    ? "priorità bassa"
    : "priorità normale";
  return `Inserito dalla lista d'attesa (${label}) in uno slot libero compatibile.`;
}

/** Explanation for a protected VIP that was intentionally not moved. */
export function explainVipProtected(): string {
  return "VIP non spostato per preservare lo slot preferito.";
}
