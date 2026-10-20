/* Eine Frage vom Dashboard aus. Das Feld nimmt sie auf, Enter bringt sie in den
   Fragen-Screen — mitsamt Text, nicht bloß den Screen.

   Beantwortet wird dort, nicht hier: die Antwort braucht Belege, ein Panel und
   einen Abbruchweg. Eine Kachel, die eine Antwort halb zeigt, wäre schlechter als
   eine, die den Weg dorthin öffnet. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';
import { TileFrame } from '../TileFrame';

export function AskTile() {
  const t = useT();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');

  const ask = (): void => {
    const text = question.trim();
    if (text.length === 0) return;
    void navigate(`/ask?q=${encodeURIComponent(text)}`);
  };

  return (
    <TileFrame id="ask" title={t('tile.ask.label')}>
      <div className="sb-tileask">
        <div className="sb-tileask-row">
          <input
            type="text"
            className="gs-input"
            aria-label={t('tile.ask.label')}
            placeholder={t('tile.ask.placeholder')}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              ask();
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            icon="message-square"
            disabled={question.trim().length === 0}
            onClick={ask}
          >
            {t('tile.ask.submit')}
          </Button>
        </div>
      </div>
    </TileFrame>
  );
}
