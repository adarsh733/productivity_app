import { useState } from 'react';
import FeedScreen from './components/feed/FeedScreen';
import InboxScreen from './components/inbox/InboxScreen';
import ProgressScreen from './components/progress/ProgressScreen';
import HindiScreen from './components/hindi/HindiScreen';
import TabBar, { type Tab } from './components/shell/TabBar';
import FirstRun, { isFirstRunCompleted } from './components/shell/FirstRun';

export default function App() {
  const [tab, setTab] = useState<Tab>('feed');
  const [showFirstRun, setShowFirstRun] = useState<boolean>(!isFirstRunCompleted());

  if (showFirstRun) {
    return <FirstRun onComplete={() => setShowFirstRun(false)} />;
  }

  return (
    <div className="app">
      <main className="app-body">
        <div className="pane" hidden={tab !== 'feed'}>
          <FeedScreen />
        </div>
        {tab === 'inbox' && <InboxScreen />}
        {tab === 'hindi' && <HindiScreen />}
        {tab === 'progress' && <ProgressScreen />}
      </main>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
