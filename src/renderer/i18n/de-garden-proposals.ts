/* Deutsche Texte für die Vorschläge des Agenten in der Pflege. Gleicher
   Schlüsselsatz wie `en-garden-proposals.ts` — ein Test prüft das. */

export const deGardenProposals = {
  'garden.proposal.title': 'Vorschläge des Agenten',
  'garden.proposal.kind.edit': 'Änderung',
  'garden.proposal.kind.filing': 'Ablage',
  'garden.proposal.filing': '{target} in {fileInto} ablegen',
  'garden.proposal.accept': 'Annehmen',
  'garden.proposal.reject': 'Ablehnen',
  'garden.proposal.conflict':
    'Seit dem Lesen durch den Agenten geändert. Es wurde nichts geschrieben.',
  'garden.proposal.invalidBadge': 'Nicht annehmbar',
  'garden.proposal.invalid.unreadable': 'Die Datei ließ sich nicht als Vorschlag lesen.',
  'garden.proposal.invalid.missing-field': 'Dem Vorschlag fehlt das Feld {detail}.',
  'garden.proposal.invalid.unknown-kind': 'Die Art dieses Vorschlags ist unbekannt.',
  'garden.proposal.invalid.bad-hash': 'Der Basis-Hash ist kein SHA-256-Wert.',
  'garden.proposal.invalid.forbidden-target': 'Vorschläge dürfen {detail} nicht ändern.',
  'garden.proposal.invalid.outside-vault': '{detail} liegt außerhalb des Vaults.',
  'garden.proposal.invalid.target-missing': 'Das Ziel {detail} existiert nicht.',
  'garden.proposal.invalid.filing-invalid': 'Die Ablage ist ungültig: {detail}',
} as const;
