import { useState } from 'react';
import TabBar, { type AppTab } from './components/shell/TabBar';
import FeedScreen from './components/feed/FeedScreen';
import FavoritesScreen from './components/favorites/FavoritesScreen';
import AskScreen from './components/ask/AskScreen';
import MeScreen from './components/me/MeScreen';
import { useAppOpen } from './features/you/useAppOpen';
import { useModuleBatches } from './features/auto/useModuleBatches';
import { useSync } from './sync/useSync';

export default function App() {
  useAppOpen();
  useModuleBatches();
  useSync();
  const [activeTab, setActiveTab] = useState<AppTab>('feed');

  return (
    <div className="reset-app-shell v3-app-shell v5-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main className="reset-app-body" id="main-content">
        {activeTab === 'feed' && <FeedScreen />}
        {activeTab === 'favorites' && <FavoritesScreen />}
        {activeTab === 'ask' && <AskScreen />}
        {activeTab === 'me' && <MeScreen />}
      </main>

      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
