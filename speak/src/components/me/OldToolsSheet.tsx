import { useState } from 'react';
import BrowseScreen from '../browse/BrowseScreen';
import SpeakScreen from '../speak/SpeakScreen';
import YouScreen from '../you/YouScreen';
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from '../shell/Icons';
import type { Card } from '../../types/contract';

export type OldToolView = 'menu' | 'browse' | 'speak' | 'you';

export interface OldToolsSheetProps {
  onClose: () => void;
  initialView?: OldToolView;
  initialCard?: Card | null;
}

const ITEMS: Array<{ id: Exclude<OldToolView, 'menu'>; label: string; hint: string }> = [
  { id: 'browse', label: 'Browse', hint: 'Search and filter every card' },
  { id: 'speak', label: 'Speak and voice lab', hint: 'Daily challenge, routine, drills' },
  { id: 'you', label: 'Old You', hint: 'Voice charts, recordings, notes' },
];

/**
 * The old v4 screens, kept alive behind the gear on Me. Nothing here is
 * deleted: it is just no longer on the tab bar.
 */
export default function OldToolsSheet({
  onClose,
  initialView = 'menu',
  initialCard = null,
}: OldToolsSheetProps) {
  const [view, setView] = useState<OldToolView>(initialView);
  const [speakCard, setSpeakCard] = useState<Card | null>(initialCard);

  const openSpeakWithCard = (card?: Card) => {
    setSpeakCard(card ?? null);
    setView('speak');
  };

  const goMenu = () => {
    setSpeakCard(null);
    setView('menu');
  };

  return (
    <div className="old-tools" role="dialog" aria-modal="true" aria-label="Old tools">
      <header className="old-tools-head">
        {view === 'menu' ? (
          <span className="old-tools-spacer" />
        ) : (
          <button type="button" className="old-tools-btn tap" onClick={goMenu} aria-label="Back to old tools">
            <ArrowLeftIcon />
          </button>
        )}
        <h2 className="old-tools-title">Old tools</h2>
        <button type="button" className="old-tools-btn tap" onClick={onClose} aria-label="Close old tools">
          <CloseIcon />
        </button>
      </header>

      <div className="old-tools-body">
        {view === 'menu' && (
          <ul className="old-tools-list">
            {ITEMS.map((item) => (
              <li key={item.id}>
                <button type="button" className="old-tools-item tap" onClick={() => setView(item.id)}>
                  <span className="old-tools-item-text">
                    <span className="old-tools-item-label">{item.label}</span>
                    <span className="old-tools-item-hint">{item.hint}</span>
                  </span>
                  <ArrowRightIcon className="me-row-chev" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {view === 'browse' && <BrowseScreen onOpenCard={openSpeakWithCard} />}
        {view === 'speak' && <SpeakScreen initialCard={speakCard} onCloseDrill={goMenu} />}
        {view === 'you' && <YouScreen onOpenSpeakWithCard={openSpeakWithCard} />}
      </div>
    </div>
  );
}
