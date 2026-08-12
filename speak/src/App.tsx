import { useState } from 'react';
import FeedScreen from './components/feed/FeedScreen';
import InboxScreen from './components/inbox/InboxScreen';
import ProgressScreen from './components/progress/ProgressScreen';
import HindiScreen from './components/hindi/HindiScreen';
import TabBar, { type Tab } from './components/shell/TabBar';

/**
 * The app opens on the feed. Not a dashboard, not a menu, not a "good morning"
 * screen — a card, ready to be answered. Every extra tap between the unlock and
 * the first rep is a tap in which Instagram wins.
 *
 * The feed stays mounted while other tabs are shown, so a glance at the Inbox
 * doesn't throw away the card you were part-way through.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('feed');

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
