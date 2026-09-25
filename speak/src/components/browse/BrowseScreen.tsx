import { useState } from 'react';
import type { Card } from '../../types/contract';
import { useBrowse } from '../../features/browse/useBrowse';
import type { CategoryDeck } from '../../features/browse/categories';
import DeckModal from './DeckModal';
import CardDetailSheet from '../cards/CardDetailSheet';

export interface BrowseScreenProps {
  onOpenCard?: (card: Card) => void;
}

export default function BrowseScreen({ onOpenCard }: BrowseScreenProps) {
  const { query, setQuery, filteredDecks, matchingCards, deckStats } = useBrowse();
  const [selectedDeck, setSelectedDeck] = useState<CategoryDeck | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  return (
    <div className="screen browse-screen">
      <header className="browse-header">
        <h1 className="h1s">Browse</h1>
        <div className="search">
          <span aria-hidden="true">🔍</span>
          <input
            type="text"
            placeholder="Search decks, words, phrases…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="browse-search-input"
            aria-label="Search decks and cards"
          />
          {query && (
            <button
              type="button"
              className="browse-clear-btn tap"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* When searching, show matching card hits if any */}
      {query.trim() && matchingCards.length > 0 && (
        <section className="search-results-section" aria-label="Search Results">
          <div className="sechd">
            <b>Matching Cards ({matchingCards.length})</b>
          </div>
          <div className="search-cards-list">
            {matchingCards.slice(0, 10).map((c) => (
              <div
                key={c.id}
                className="row tap search-card-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCard(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedCard(c);
                  }
                }}
                aria-label={`View card: ${getCardTitle(c)}, ${getCardSubtitle(c)}`}
              >
                <span className="badge b-word search-card-badge">
                  {c.lang === 'hi' ? 'Hindi' : c.type}
                </span>
                <div className="t">
                  <b>{getCardTitle(c)}</b>
                  <small>{getCardSubtitle(c)}</small>
                </div>
                <span className="arw" aria-hidden="true">›</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2-Column Deck Grid */}
      <section className="browse-decks-section" aria-label="Category Decks">
        <div className="sechd">
          <b>Category Decks</b>
        </div>
        <div className="browse-deck-grid grid2">
          {filteredDecks.map((deck) => {
            const stats = deckStats[deck.id] ?? { total: 0, seen: 0, percent: 0, cards: [] };
            return (
              <div
                key={deck.id}
                className="deck tap"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDeck(deck)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedDeck(deck);
                  }
                }}
                aria-label={`${deck.name}: ${stats.total} cards, ${stats.percent}% completed`}
              >
                <span className="g" aria-hidden="true">{deck.icon}</span>
                <b>{deck.name}</b>
                <small>{deck.description}</small>
                <div className="ring">
                  <div className="ringbar" role="progressbar" aria-valuenow={stats.percent} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${Math.max(stats.percent, 3)}%` }} />
                  </div>
                  <small>{stats.total} cards</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Scoped Deck View Modal */}
      {selectedDeck && (
        <DeckModal
          deck={selectedDeck}
          cards={deckStats[selectedDeck.id]?.cards ?? []}
          onClose={() => setSelectedDeck(null)}
          onOpenSpeakWithCard={onOpenCard}
        />
      )}

      {/* Card Detail Sheet */}
      {selectedCard && (
        <CardDetailSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onOpenSpeakWithCard={onOpenCard}
        />
      )}
    </div>
  );
}

function getCardTitle(card: Card): string {
  switch (card.type) {
    case 'word':
    case 'pronounce':
    case 'feeling':
      return card.term;
    case 'idiom':
      return card.phrase;
    case 'swap':
      return `${card.weak} ➔ ${card.answers[0]}`;
    case 'phrase':
      return `${card.weak} ➔ ${card.strong}`;
    case 'action_verb':
      return card.verb;
    case 'story_move':
      return card.move;
    case 'say_it':
      return card.line;
    case 'breath':
      return card.title;
    case 'describe':
      return card.prompt;
    case 'explain':
      return card.topic;
    case 'teach_back':
      return card.prompt;
    case 'situation':
      return card.title;
    default: {
      const _exhaustive: never = card;
      return (_exhaustive as { id?: string })?.id ?? '';
    }
  }
}

function getCardSubtitle(card: Card): string {
  switch (card.type) {
    case 'word':
    case 'idiom':
    case 'action_verb':
    case 'feeling':
      return card.meaning;
    case 'phrase':
    case 'story_move':
      return card.why;
    case 'swap':
      return card.answers.join(', ');
    case 'pronounce':
      return card.syllables;
    case 'say_it':
      return `Target pace: ~${card.targetWpm} wpm`;
    case 'describe':
      return card.targetVocab.join(', ');
    case 'explain':
      return card.angle;
    case 'teach_back':
      return 'Recall & explain in 45s';
    case 'breath':
      return card.instructions[0] ?? '';
    default:
      return '';
  }
}
