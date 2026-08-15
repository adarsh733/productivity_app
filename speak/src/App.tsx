import { useState } from 'react';
import FirstRun, { isFirstRunCompleted } from './components/shell/FirstRun';
import TabBar from './components/shell/TabBar';
import { CaptureIcon } from './components/shell/Icons';
import CaptureSheet from './components/reset/CaptureSheet';
import CoachScreen from './components/reset/CoachScreen';
import PracticeScreen from './components/reset/PracticeScreen';
import ProgressScreen from './components/reset/ProgressScreen';
import RescueFlow from './components/reset/RescueFlow';
import SessionRunner from './components/reset/SessionRunner';
import TodayScreen from './components/reset/TodayScreen';
import { useResetProduct } from './features/reset/useResetProduct';

export default function App() {
  const product = useResetProduct();
  const [showFirstRun, setShowFirstRun] = useState(!isFirstRunCompleted());
  const { snapshot, dispatch } = product;

  if (showFirstRun) {
    return (
      <FirstRun
        onEnvironment={(environment) => dispatch({ type: 'set-environment', environment })}
        onComplete={() => setShowFirstRun(false)}
      />
    );
  }

  if (snapshot.overlay === 'session') {
    return (
      <SessionRunner
        snapshot={snapshot}
        dispatch={dispatch}
        saveAttemptAudio={product.saveAttemptAudio}
        finishLoop={product.finishLoop}
      />
    );
  }

  if (snapshot.overlay === 'capture') {
    return <CaptureSheet snapshot={snapshot} dispatch={dispatch} />;
  }

  if (snapshot.overlay === 'rescue') {
    return <RescueFlow snapshot={snapshot} dispatch={dispatch} recordUrge={product.recordUrge} />;
  }

  return (
    <div className="reset-app-shell">
      <main className="reset-app-body" id="main-content">
        {snapshot.tab === 'today' && <TodayScreen snapshot={snapshot} dispatch={dispatch} />}
        {snapshot.tab === 'coach' && <CoachScreen snapshot={snapshot} dispatch={dispatch} />}
        {snapshot.tab === 'practice' && <PracticeScreen snapshot={snapshot} dispatch={dispatch} />}
        {snapshot.tab === 'progress' && <ProgressScreen />}
      </main>

      <button
        type="button"
        className="reset-capture-action tap"
        onClick={() => dispatch({ type: 'open-overlay', overlay: 'capture' })}
        aria-label="Capture a thought"
      >
        <CaptureIcon />
        <span>Capture</span>
      </button>

      <TabBar active={snapshot.tab} onChange={(tab) => dispatch({ type: 'navigate', tab })} />
    </div>
  );
}
