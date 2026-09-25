import { useState } from 'react';
import type { Card } from '../../types/contract';
import { useYou } from '../../features/you/useYou';
import WeeklyDots from './WeeklyDots';
import BookmarksDrawer from './BookmarksDrawer';
import GoalSelector from './GoalSelector';
import InterestsManager from './InterestsManager';

export interface YouScreenProps {
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function YouScreen({ onOpenSpeakWithCard }: YouScreenProps) {
  const [showBookmarks, setShowBookmarks] = useState(false);
  const { profile, daysList, streak, totalCards, totalReps, todayXp, bookmarkCount, today } = useYou();

  return (
    <div className="screen you-screen">
      <header className="you-header">
        <div className="you-header-top">
          <div>
            <h1 className="h1s">You</h1>
            <p className="you-header-sub">
              Total Progress &amp; Preferences
            </p>
          </div>
          <span className="badge b-pace you-xp-badge">
            ⚡ {todayXp} XP today
          </span>
        </div>
      </header>

      {/* 3 Core Stats */}
      <div className="stat3">
        <div className="stat">
          <b>{streak}</b>
          <small>Day Streak</small>
        </div>
        <div className="stat">
          <b>{totalCards}</b>
          <small>Cards Read</small>
        </div>
        <div className="stat">
          <b>{totalReps}</b>
          <small>Spoken Reps</small>
        </div>
      </div>

      {/* 7-Day Activity Visualizer */}
      <div className="you-section-spacer">
        <WeeklyDots days={daysList} today={today} />
      </div>

      {/* Weekly Honest Summary */}
      <div className="recap you-section-spacer">
        <b>Practice Momentum</b>
        <p>
          You have read <b>{totalCards}</b> cards and recorded <b>{totalReps}</b> spoken reps.
          Short, daily reps build durable speech reflexes without cognitive fatigue.
        </p>
      </div>

      {/* Bookmarked Cards Section */}
      <div className="you-section">
        <div className="sechd">
          <b>Saved &amp; Bookmarks</b>
        </div>
        <div
          className="row tap saved-bookmarks-trigger-row"
          role="button"
          tabIndex={0}
          onClick={() => setShowBookmarks(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowBookmarks(true);
            }
          }}
          aria-label={`View bookmarked cards (${bookmarkCount} saved)`}
        >
          <span className="g" aria-hidden="true">🔖</span>
          <div className="t">
            <b>Bookmarked Cards</b>
            <small>{bookmarkCount} saved cards</small>
          </div>
          <span className="arw" aria-hidden="true">›</span>
        </div>
      </div>

      {/* Daily Commitment Goal Selector */}
      <div className="you-section-spacer">
        <GoalSelector currentGoal={profile?.dailyGoal} />
      </div>

      {/* Feed Interest Focus Manager */}
      <div className="you-section-spacer you-bottom-spacer">
        <InterestsManager interests={profile?.interests ?? []} />
      </div>

      {/* Bookmarks Drawer Modal */}
      {showBookmarks && (
        <BookmarksDrawer
          onClose={() => setShowBookmarks(false)}
          onOpenSpeakWithCard={onOpenSpeakWithCard}
        />
      )}
    </div>
  );
}
