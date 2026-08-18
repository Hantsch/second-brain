/* Wo die Frage gestellt wird, entscheidet, worüber sie geht.

   Der Helfer ist pur, also wird er pur geprüft: Adresse rein, Einschränkung
   raus — ohne Router, ohne React, ohne Overlay. Der Fall, der hier am meisten
   wert ist, ist der zweite Sinn von `p`: auf der Wissensseite ist das ein
   Seitenpfad, kein Projekt. Wer das verwechselt, filtert Antworten gegen ein
   Projekt, das es nicht gibt — und bekommt „dazu steht nichts im Vault". */

import { describe, expect, it } from 'vitest';
import { askScopeFor } from '@renderer/lib/ask-scope';

const NOTHING = { module: null, project: null };

/** Kurzform: `/pfad?abfrage` in die zwei Argumente des Helfers zerlegt. */
function scopeOf(address: string) {
  const [pathname = '', query = ''] = address.split('?');
  return askScopeFor(pathname, new URLSearchParams(query));
}

describe('askScopeFor', () => {
  it('nimmt in einem Modul das Modul mit', () => {
    expect(scopeOf('/knowledge?m=identity-management')).toEqual({
      module: 'identity-management',
      project: null,
    });
  });

  /* Story 002 hat `/modules` zur Weiterleitung gemacht. Beide Adressen führen
     auf denselben Screen, also entscheidet der Parameter, nicht der Pfad. */
  it('nimmt das Modul auch auf der alten Adresse mit', () => {
    expect(scopeOf('/modules?m=identity-management')).toEqual({
      module: 'identity-management',
      project: null,
    });
  });

  it('hält das `p` der Wissensseite für einen Seitenpfad, nicht für ein Projekt', () => {
    expect(
      scopeOf(
        '/knowledge?m=identity-management&p=modules/identity-management/wiki/concepts/token-lebensdauer.md',
      ),
    ).toEqual({ module: 'identity-management', project: null });
  });

  it('nimmt in einem Projekt das Projekt mit', () => {
    expect(scopeOf('/projects?p=orbit-sso-migration')).toEqual({
      module: null,
      project: 'orbit-sso-migration',
    });
  });

  it('nimmt in einem Projekt auch mit Schrägstrich am Ende das Projekt mit', () => {
    expect(scopeOf('/projects/?p=orbit-sso-migration')).toEqual({
      module: null,
      project: 'orbit-sso-migration',
    });
  });

  it('schränkt auf der Projektliste nichts ein', () => {
    expect(scopeOf('/projects')).toEqual(NOTHING);
    expect(scopeOf('/projects?tab=todos')).toEqual(NOTHING);
  });

  /* Das `p` der Agenten ist ein Verzeichnisschlüssel, kein Projekt-Slug. */
  it('schränkt auf der Agentenseite nichts ein', () => {
    expect(scopeOf('/agents?a=claude&p=c--development-Kunde-Nyota')).toEqual(NOTHING);
  });

  it('schränkt überall sonst nichts ein', () => {
    for (const address of ['/dashboard', '/inbox', '/journal', '/settings?tab=models', '/']) {
      expect(scopeOf(address), address).toEqual(NOTHING);
    }
  });

  it('hält einen leeren Parameter für keine Einschränkung', () => {
    expect(scopeOf('/knowledge?m=')).toEqual(NOTHING);
    expect(scopeOf('/projects?p=%20%20')).toEqual(NOTHING);
  });
});
