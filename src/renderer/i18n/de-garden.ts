/* Deutsche Oberflächentexte der Pflege: Gesundheit mit Begründung, Rat, Befunde
   mit Filter, die Widerspruchs-Karte und der Lauf mit Fortschritt.

   Zwei Regeln stecken in den Formulierungen:
   - **Nichts behaupten.** „Noch nicht geprüft" statt einer erfundenen 100, „öffnet
     nur" bei jeder Aktion, die nichts schreibt, „aus der Zahl und Schwere
     abgeleitet" beim Rat ohne Modell.
   - **Ein Befund sagt, warum er einer ist.** Titel und Erklärung kommen aus dem
     Kern (fertige Sätze im IPC-Vertrag); hier stehen die Beschriftungen um sie
     herum — Arten, Zählungen, Knöpfe.

   Flache Keys, sentence case, keine Emoji. `en-garden.ts` trägt denselben
   Key-Satz — ein Test prüft das. */

export const deGarden = {
  // ── Lauf ──────────────────────────────────────────────────────────────────
  'garden.run.action': 'Jetzt prüfen',
  'garden.run.again': 'Neu prüfen',
  'garden.run.cancel': 'Prüfung abbrechen',
  'garden.run.running': 'Prüfung läuft',
  'garden.run.check': 'Prüfung: {check}',
  'garden.run.audit': 'Das Modell deutet die Ergebnisse',
  'garden.run.step': '{done} von {total}',
  'garden.run.cancelled': 'Abgebrochen. Der letzte Bericht bleibt, wie er war.',

  // ── Gesundheit ────────────────────────────────────────────────────────────
  'garden.health.label': 'Gesundheit',
  'garden.health.aria': 'Gesundheit {score} von 100',
  'garden.health.unknown': 'Noch nicht geprüft',
  'garden.health.unknownBody':
    'Es liegt noch keine Prüfung vor. Ohne Prüfung gibt es keinen Wert — eine 100 wäre erfunden.',
  'garden.health.noStock':
    'Kein Bestand, auf den sich ein Wert beziehen könnte: keine Seiten, keine Projekte, keine Quellen, keine Dumps.',
  'garden.health.why': 'Woher der Wert kommt',
  'garden.health.perfect': 'Nichts drückt den Wert: Die Prüfung hat keine Ergebnisse ergeben.',
  'garden.health.lost': '{count} von 100 Punkten gehen auf diese Ergebnisse zurück.',
  'garden.health.pointOne': '1 Punkt',
  'garden.health.points': '{count} Punkte',
  'garden.health.ranAt': 'Zuletzt geprüft',
  'garden.health.withModel': 'mit Modell gedeutet',
  'garden.health.withoutModel': 'ohne Modell, nur die maschinellen Prüfungen',

  // ── Rat ───────────────────────────────────────────────────────────────────
  'garden.advice.label': 'Was als nächstes',
  'garden.advice.fromModel': 'Vom Modell gedeutet.',
  'garden.advice.heuristic': 'Ohne Modell aus Zahl und Schwere der Ergebnisse abgeleitet.',
  'garden.advice.orphan':
    'Auf verwaiste Seiten einen Verweis setzen — über Links findet sie sonst niemand.',
  'garden.advice.broken-link': 'Kaputte Wikilinks in den genannten Zeilen richtigstellen.',
  'garden.advice.index-drift': 'Fehlende Katalogzeilen nachtragen, eine je Seite.',
  'garden.advice.stale-page': 'Angestaubte Seiten lesen und als geprüft markieren.',
  'garden.advice.unfiled-dump': 'Liegengebliebene Dumps einordnen.',
  'garden.advice.unprocessed-source': 'Unverdichtete Quellen zu Source-Seiten verdichten.',
  'garden.advice.project-without-next-step':
    'Für Projekte ohne nächsten Schritt je einen Satz festlegen.',
  'garden.advice.contradiction': 'Widersprüche benennen — beide Fassungen bleiben stehen.',
  'garden.advice.near-duplicate':
    'Beinahe-Dubletten vergleichen und zusammenlegen, wo es dasselbe ist.',
  'garden.advice.missing-page': 'Für häufig genannte Begriffe eigene Seiten anlegen.',

  // ── Befunde ───────────────────────────────────────────────────────────────
  'garden.findings.label': 'Ergebnisse',
  'garden.findings.totalOne': '1 Ergebnis',
  'garden.findings.total': '{count} Ergebnisse',
  'garden.findings.shown': '{shown} von {total} angezeigt',
  'garden.findings.none': 'Keine Ergebnisse.',
  'garden.findings.noneBody':
    'Geprüft wurden Wiki-Seiten und Kataloge, Rohquellen, Dumps in der Inbox und Projekte ohne nächsten Schritt.',
  'garden.findings.filtered': 'Kein Ergebnis passt zu diesem Filter.',
  'garden.checkedAt': 'Zuletzt geprüft: {when}',

  // ── Filter ────────────────────────────────────────────────────────────────
  'garden.filter.label': 'Ergebnisse filtern',
  'garden.filter.kind': 'Art',
  'garden.filter.module': 'Modul',
  'garden.filter.severity': 'Schwere',
  'garden.filter.all': 'Alle',
  'garden.filter.noModule': 'Ohne Modul',
  'garden.filter.reset': 'Filter zurücksetzen',
  'garden.severity.high': 'Hoch',
  'garden.severity.warn': 'Mittel',
  'garden.severity.info': 'Gering',

  // ── Arten ─────────────────────────────────────────────────────────────────
  'garden.kind.orphan': 'Verwaiste Seiten',
  'garden.kind.broken-link': 'Kaputte Wikilinks',
  'garden.kind.index-drift': 'Katalog-Drift',
  'garden.kind.stale-page': 'Angestaubte Seiten',
  'garden.kind.contradiction': 'Widersprüche',
  'garden.kind.missing-page': 'Begriffe ohne Seite',
  'garden.kind.near-duplicate': 'Beinahe-Dubletten',
  'garden.kind.unfiled-dump': 'Liegengebliebene Dumps',
  'garden.kind.unprocessed-source': 'Unverdichtete Quellen',
  'garden.kind.project-without-next-step': 'Projekte ohne nächsten Schritt',

  'garden.countOne.orphan': '1 verwaiste Seite',
  'garden.countMany.orphan': '{count} verwaiste Seiten',
  'garden.countOne.broken-link': '1 kaputter Wikilink',
  'garden.countMany.broken-link': '{count} kaputte Wikilinks',
  'garden.countOne.index-drift': '1 Katalogeintrag',
  'garden.countMany.index-drift': '{count} Katalogeinträge',
  'garden.countOne.stale-page': '1 angestaubte Seite',
  'garden.countMany.stale-page': '{count} angestaubte Seiten',
  'garden.countOne.contradiction': '1 Widerspruch',
  'garden.countMany.contradiction': '{count} Widersprüche',
  'garden.countOne.missing-page': '1 Begriff ohne Seite',
  'garden.countMany.missing-page': '{count} Begriffe ohne Seite',
  'garden.countOne.near-duplicate': '1 Beinahe-Dublette',
  'garden.countMany.near-duplicate': '{count} Beinahe-Dubletten',
  'garden.countOne.unfiled-dump': '1 liegengebliebener Dump',
  'garden.countMany.unfiled-dump': '{count} liegengebliebene Dumps',
  'garden.countOne.unprocessed-source': '1 unverdichtete Quelle',
  'garden.countMany.unprocessed-source': '{count} unverdichtete Quellen',
  'garden.countOne.project-without-next-step': '1 Projekt ohne nächsten Schritt',
  'garden.countMany.project-without-next-step': '{count} Projekte ohne nächsten Schritt',

  // ── Karte ─────────────────────────────────────────────────────────────────
  'garden.card.files': 'Betroffene Dateien',
  'garden.card.openFile': 'Datei öffnen',
  'garden.card.openThis': '„{path}" öffnen',
  'garden.card.preview': 'Geschrieben wird in {file}:',
  'garden.card.previewNothing': 'Schreibt nichts. Öffnet nur, wo es weitergeht.',
  'garden.card.dismiss': 'Passt so',
  'garden.card.dismissed': 'Passt so. Das Ergebnis zählt nicht mehr gegen die Gesundheit.',
  'garden.card.undismiss': 'Wieder anzeigen',
  'garden.card.written': 'Geschrieben: {file}',
  'garden.card.undo': 'Rückgängig',
  'garden.card.undone': 'Zurückgedreht.',
  'garden.card.keptOne': '1 Datei blieb unberührt: sie wurde seither bearbeitet.',
  'garden.card.kept': '{count} Dateien blieben unberührt: sie wurden seither bearbeitet.',
  'garden.card.opened': 'Geöffnet: {path}',
  'garden.card.alsoOpen': 'Die zweite Datei: {path}',
  'garden.card.openSecond': 'Zweite Datei öffnen',

  // ── Widerspruch ───────────────────────────────────────────────────────────
  'garden.contradiction.never': 'Nie automatisch aufgelöst: beide Fassungen bleiben stehen.',
  'garden.contradiction.section': 'Abschnitt „Widersprüche" dieser Seite',
  'garden.contradiction.excerpt': 'Anfang der Seite — die Stelle ist in der Datei nicht benannt',
  'garden.contradiction.updated': 'Stand',
  'garden.contradiction.name': 'Beide behalten und benennen',
  'garden.contradiction.supersede': '„{newer}" überholt „{older}"',
  'garden.contradiction.supersedeHint':
    'Trägt supersedes: [{slug}] in {file} ein. Beide Seiten bleiben stehen, die ältere ist damit als überholt markiert.',
  'garden.contradiction.sameDate':
    'Beide Seiten tragen dasselbe Datum. Welche die ältere ist, entscheidet ein Mensch — in der Datei.',
  'garden.contradiction.named':
    'Der Widerspruch ist auf der Seite benannt. Zu schreiben ist nichts.',
  'garden.contradiction.superseded': 'Eingetragen in {file}.',

  // ── Ohne Modell ───────────────────────────────────────────────────────────
  'garden.llm.title': 'Was ein Modell zusätzlich fände',
  'garden.llm.body':
    'Widersprüche zwischen zwei Seiten, Beinahe-Dubletten und häufig genannte Begriffe ohne eigene Seite. Alles darüber steht oben vollständig.',
} as const;
