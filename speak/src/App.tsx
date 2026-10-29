import { useState } from 'react';
import TabBar, { type AppTab } from './components/shell/TabBar';
import FeedScreen from './components/feed/FeedScreen';
import AskScreen from './components/ask/AskScreen';
import MeScreen from './components/me/MeScreen';
import OldToolsSheet, { type OldToolView } from './components/me/OldToolsSheet';
import { useAppOpen } from './features/you/useAppOpen';
import { useAutoTopUp } from './features/auto/useAutoTopUp';
import { useAutoPlan } from './features/auto/useAutoPlan';
import { useSync } from './sync/useSync';
import type { Card } from './types/contract';

interface OldTools {
  view: OldToolView;
  card: Card | null;
}

export default function App() {
  useAppOpen();
  useAutoTopUp();
  useAutoPlan();
  useSync();
  const [activeTab, setActiveTab] = useState<AppTab>('feed');
  const [oldTools, setOldTools] = useState<OldTools | null>(null);

  // A feed card's "say it" opens the old Speak screen inside the gear sheet.
  const handleOpenSpeakWithCard = (card?: Card) => {
    setOldTools({ view: 'speak', card: card ?? null });
  };

  return (
    <div className="reset-app-shell v3-app-shell v5-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main className="reset-app-body" id="main-content">
        {activeTab === 'feed' && <FeedScreen onOpenSpeakWithCard={handleOpenSpeakWithCard} />}
        {activeTab === 'ask' && <AskScreen />}
        {activeTab === 'me' && (
          <MeScreen onOpenOldTools={() => setOldTools({ view: 'menu', card: null })} />
        )}
      </main>

      {oldTools && (
        <OldToolsSheet
          initialView={oldTools.view}
          initialCard={oldTools.card}
          onClose={() => setOldTools(null)}
        />
      )}

      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
