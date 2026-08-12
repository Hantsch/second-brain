/**
 * Kleine Textwerkzeuge für Adressen — von mehreren Kernmodulen gebraucht.
 *
 * `hostOf` stand vorher dreimal im Kern (Einordnen, LLM-HTTP, URL-Ingest), jedes
 * Mal ein Stück anders. Eine Kopie, die auseinanderläuft, ist ein Fehler, der
 * erst im Fehlertext beim Nutzer auffällt — deshalb eine Fassung.
 */

/**
 * Der Host eines Links: ohne Schema, ohne `www.`, klein geschrieben, mit Port.
 *
 * Bewusst nur der Host: er landet in Begründungen und Fehlermeldungen, und ein
 * Query-Parameter könnte einen Schlüssel tragen (Guardrail 6).
 *
 * `fallback` gilt, wenn nichts Host-artiges darin steht. Ohne `fallback` kommt
 * die Eingabe zurück — sie ist dann das Beste, was es zu sagen gibt.
 */
export function hostOf(url: string, fallback?: string): string {
  const text = (url ?? '').trim();
  try {
    return new URL(text).host.replace(/^www\./i, '').toLowerCase();
  } catch {
    if (fallback !== undefined) return fallback;
    // Ohne Schema ist es keine URL für `new URL`, aber oft trotzdem ein Host.
    const match = /^\/*(?:www\.)?([^/\s?#]+)/i.exec(text);
    return match?.[1]?.toLowerCase() ?? text;
  }
}
