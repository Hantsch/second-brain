/* Der sichtbare Einstieg in die Befehlspalette.

   Die Palette ist der Kanal, der Vault-Daten findet — ohne sichtbaren Einstieg
   existiert sie nur für den, der die Tastenkombination kennt. Deshalb steht hier
   eine klickbare Attrappe eines Suchfelds mit Lupe und Tastenhinweis: sie sieht
   aus wie ein Feld, ist aber ein Knopf, der die Palette öffnet.

   `sb-no-drag`, sonst schluckt die Ziehfläche der Titelzeile den Klick. */

import { Icon } from '../atoms/Icon';
import { Kbd } from '../atoms/Kbd';
import { useT } from '../i18n';

export interface SearchTriggerProps {
  onOpen: () => void;
}

export function SearchTrigger({ onOpen }: SearchTriggerProps) {
  const t = useT();
  return (
    <button
      type="button"
      className="sb-searchtrigger sb-no-drag"
      aria-label={t('titlebar.searchAria')}
      aria-keyshortcuts="Control+K"
      onClick={onOpen}
    >
      <Icon name="search" size={14} />
      <span className="sb-searchtrigger-text">{t('titlebar.search')}</span>
      <Kbd keys={['Ctrl', 'K']} />
    </button>
  );
}
