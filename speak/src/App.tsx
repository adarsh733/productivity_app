import { useState } from 'react';
import FirstRun, { isFirstRunCompleted } from './components/onboarding/FirstRun';
import TabBar, { type AppTab } from './components/shell/TabBar';
import FeedScreen from './components/feed/FeedScreen';
import BrowseScreen from './components/browse/BrowseScreen';
import SpeakScreen from './components/speak/SpeakScreen';
import YouScreen from './components/you/YouScreen';
import CaptureSheet from './components/capture/CaptureSheet';
import { useCapture } from './features/capture/useCapture';
import { useAppOpen } from './features/you/useAppOpen';
import type { Card } from './types/contract';

export default function App() {
  useAppOpen();
  const [activeTab, setActiveTab] = useState<AppTab>('feed');
  const [showFirstRun, setShowFirstRun] = useState(!isFirstRunCompleted());
  const [speakCard, setSpeakCard] = useState<Card | null>(null);
  const [returnTab, setReturnTab] = useState<AppTab | null>(null);

  const capture = useCapture();

  const handleOpenSpeakWithCard = (card?: Card) => {
    setReturnTab(activeTab);
    setSpeakCard(card ?? null);
    setActiveTab('speak');
  };

  const handleTabChange = (tab: AppTab) => {
    if (activeTab === 'speak' && tab !== 'speak') {
      setSpeakCard(null);
      setReturnTab(null);
    }
    setActiveTab(tab);
  };

  const handleCloseDrill = () => {
    const nextTab = returnTab ?? 'speak';
    setSpeakCard(null);
    setReturnTab(null);
    setActiveTab(nextTab);
  };

  if (showFirstRun) {
    return <FirstRun onComplete={() => setShowFirstRun(false)} />;
  }

  // Hide FAB on Feed tab to guarantee it NEVER obstructs action buttons,
  // and hide when capture overlay or modals are active.
  const showFab = !capture.isOpen && activeTab !== 'feed' && activeTab !== 'speak';

  return (
    <div className="reset-app-shell v3-app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main className="reset-app-body" id="main-content">
        {activeTab === 'feed' && (
          <FeedScreen onOpenSpeakWithCard={handleOpenSpeakWithCard} />
        )}
        {activeTab === 'browse' && (
          <BrowseScreen onOpenCard={handleOpenSpeakWithCard} />
        )}
        {activeTab === 'speak' && (
          <SpeakScreen
            initialCard={speakCard}
            onCloseDrill={handleCloseDrill}
          />
        )}
        {activeTab === 'you' && (
          <YouScreen onOpenSpeakWithCard={handleOpenSpeakWithCard} />
        )}
      </main>

      {showFab && (
        <button
          type="button"
          className="fab tap"
          onClick={capture.openCapture}
          aria-label="Capture a thought"
        >
          <span aria-hidden="true">✏️</span> <span>Capture</span>
        </button>
      )}

      {capture.isOpen && <CaptureSheet capture={capture} />}

      <TabBar active={activeTab} onChange={handleTabChange} />
    </div>
  );
}
