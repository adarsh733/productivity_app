import { useState } from 'react';
import '../../styles/glass-feed.css';
import '../../styles/favorites.css';
import type { FeedFilter, ModuleCard } from '../../types/contract';
import { useFavorites } from '../../features/favorites/useFavorites';
import { moduleSlides } from '../../features/cards/moduleSlides';
import { speak } from '../../lib/speech';
import ModuleCardView from '../feed/ModuleCardView';
import ChipRow from '../feed/ChipRow';
import { HeartIcon, VolumeIcon } from '../shell/Icons';

const EMPTY_ALL = 'Nothing here yet. Tap ♡ on a card in the Feed to keep it here.';
const EMPTY_MODULE = 'No favorites in this module yet.';

interface RailProps {
  card: ModuleCard;
  saved: boolean;
  slideIndex: number;
  onHeart: () => void;
}

/** Answer 3: ♡ + speaker only. */
function FavoriteRail({ card, saved, slideIndex, onHeart }: RailProps) {
  return (
    <div className="v7-rail" role="toolbar" aria-label="Card actions">
      <button
        type="button"
        className={`v7-rail-btn ${saved ? 'is-on' : ''}`}
        aria-label={saved ? 'Remove from Favorites' : 'Save to Favorites'}
        aria-pressed={saved}
        onClick={(e) => {
          e.stopPropagation();
          onHeart();
        }}
      >
        <HeartIcon className="v7-icon-sm" filled={saved} />
      </button>
      <button
        type="button"
        className="v7-rail-btn"
        aria-label="Hear pronunciation"
        onClick={(e) => {
          e.stopPropagation();
          const slides = moduleSlides(card);
          const speech = slides[slideIndex]?.speech || slides[0]?.speech || '';
          if (speech) speak(speech);
        }}
      >
        <VolumeIcon className="v7-icon-sm" />
      </button>
    </div>
  );
}

/** His ♡ cards, full-size in the Feed's swipe list, with the Feed's module chips. */
export default function FavoritesScreen() {
  const [filter, setFilter] = useState<FeedFilter>('mix');
  const [slideIdx, setSlideIdx] = useState<Record<string, number>>({});
  const { cards, total, loading, isSaved, unsave, resave } = useFavorites(filter);

  return (
    <section
      className="v7-feed v7-favorites"
      aria-label="Favorites"
      data-testid="favorites-screen"
    >
      <div className="v7-top">
        <header className="v7-header">
          <h1 className="v7-header-title">Favorites</h1>
        </header>
        <ChipRow value={filter} onChange={setFilter} />
      </div>

      {!loading && cards.length === 0 ? (
        <div className="v7-empty" role="status" data-testid="favorites-empty">
          <p className="v7-empty-sub">{total === 0 ? EMPTY_ALL : EMPTY_MODULE}</p>
        </div>
      ) : (
        <div className="v7-vfeed" tabIndex={0} aria-label="Favorite cards">
          {cards.map((card) => {
            const saved = isSaved(card.id);
            return (
              <div key={card.id} className="v7-fav-item" data-testid="fav-card">
                <ModuleCardView
                  card={card}
                  onSlideChange={(i) => setSlideIdx((prev) => ({ ...prev, [card.id]: i }))}
                  rail={
                    <FavoriteRail
                      card={card}
                      saved={saved}
                      slideIndex={slideIdx[card.id] ?? 0}
                      onHeart={() => void (saved ? unsave(card.id) : resave(card.id))}
                    />
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
