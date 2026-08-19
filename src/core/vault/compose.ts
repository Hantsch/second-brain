/**
 * Gemeinsame Schreibregeln beider Stores: Konfliktpruefung und das Zusammensetzen
 * des neuen Dateiinhalts. Hier steckt die Garantie, dass `FsVaultStore` und
 * `MemoryVaultStore` sich gleich verhalten.
 */

import {
  frontmatterText,
  mergeFrontmatter,
  parse,
  serialize,
  serializeBlock,
  splitFrontmatterBlock,
} from './frontmatter';
import { patchFrontmatterYaml } from './frontmatter-patch';
import { sha256 } from './hash';
import { VaultConflictError, VaultFrontmatterError } from './types';
import type { WriteInput } from './types';

/**
 * Prueft, ob geschrieben werden darf. Wirft `VaultConflictError`, bevor irgendetwas
 * angefasst wird — die Datei bleibt im Konfliktfall unveraendert.
 */
export function assertWritable(
  path: string,
  existing: string | null,
  options: { expectedHash?: string; mustNotExist?: boolean },
): void {
  const actualHash = existing === null ? '' : sha256(existing);
  if (options.mustNotExist === true && existing !== null) {
    throw new VaultConflictError(
      { path, expectedHash: '', actualHash },
      'Die Datei existiert bereits.',
    );
  }
  if (options.expectedHash === undefined) return;
  if (options.expectedHash === actualHash) return;
  throw new VaultConflictError(
    { path, expectedHash: options.expectedHash, actualHash },
    existing === null
      ? 'Die Datei existiert nicht mehr.'
      : 'Die Datei wurde zwischenzeitlich geaendert.',
  );
}

/**
 * Baut den neuen Dateiinhalt. Ohne Patch am Frontmatter bleibt der YAML-Block
 * wortwoertlich stehen — so ueberlebt auch die Formatierung des Nutzers.
 */
export function composeContent(path: string, existing: string | null, input: WriteInput): string {
  const patch = input.frontmatter ?? {};
  const hasPatch = Object.values(patch).some((value) => value !== undefined);

  if (existing === null) {
    return serialize(patch, input.body ?? '');
  }

  if (input.replaceFrontmatter === true) {
    const { body } = parse(existing);
    return serialize(patch, input.body ?? body);
  }

  if (!hasPatch) {
    const split = splitFrontmatterBlock(existing);
    const body = input.body ?? split.body;
    const normalized = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
    const text = normalized.length === 0 ? '' : `${normalized}\n`;
    return split.prefix.length > 0 ? `${split.prefix}\n${text}` : text;
  }

  const parsed = parse(existing);
  if (parsed.rawFrontmatter !== undefined) {
    // Unlesbares YAML wuerde beim Mergen verloren gehen. Lieber ehrlich abbrechen,
    // als Nutzerinhalt still zu ueberschreiben.
    throw new VaultFrontmatterError(path, parsed.warning ?? 'Frontmatter ist nicht lesbar.');
  }
  const body = input.body ?? parsed.body;

  /* Der Stil des Nutzers gehoert dem Nutzer: gibt es schon einen Block, wird
     darin genau das geaendert, was der Patch nennt — Flow-Listen, Kommentare und
     Anfuehrungszeichen bleiben stehen. Erst wenn das nicht geht (kein Block, kein
     lesbarer Baum), wird neu erzeugt. */
  const raw = frontmatterText(existing);
  const patched = raw === null ? null : patchFrontmatterYaml(raw, patch);
  if (patched !== null) return serializeBlock(patched, body);

  return serialize(mergeFrontmatter(parsed.frontmatter, patch), body);
}
