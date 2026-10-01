import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import PlaybackReview from './PlaybackReview';
import { db } from '../../db/db';

describe('PlaybackReview Real RTL Component Suite', () => {
  beforeEach(async () => {
    await db.recordings.clear();
    await db.days.clear();
    await db.events.clear();
  });

  it('renders drill metrics including duration, WPM, and XP earned', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    render(
      <PlaybackReview
        audio={{ id: 'rec-test-1', blob, mimeType: 'audio/webm' }}
        elapsedSec={35}
        voicedSec={20}
        recordingId="rec-test-1"
        xpReward={10}
        drillTitle="Rapid Rep: articulate"
        promptText="Say this clearly"
        wpm={130}
        pauseCount={2}
        targetVocab={['articulate']}
        targetVocabMatches={['articulate']}
        onDone={vi.fn()}
        onRedo={vi.fn()}
      />
    );

    expect(screen.getByText(/Rapid Rep: articulate/i)).toBeInTheDocument();
    expect(screen.getByText(/35s/i)).toBeInTheDocument();
    expect(screen.getByText(/130/i)).toBeInTheDocument(); // WPM
    // The async save runs on a real Dexie; under full-suite CPU load it can
    // exceed the 1 s default wait. Budget generously; the assertion is unchanged.
    await waitFor(
      () => {
        expect(screen.getByText(/Rep counted/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('does not credit silence: null audio shows Not counted and no fake streak', async () => {
    render(
      <PlaybackReview
        audio={null}
        elapsedSec={35}
        xpReward={10}
        drillTitle="Rapid Rep: silence"
        onDone={vi.fn()}
      />
    );

    await waitFor(
      () => {
        expect(screen.getByText(/Not counted/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    // Never show a fabricated streak of 1 when nothing was counted.
    expect(screen.queryByText(/🔥 1/)).not.toBeInTheDocument();
  });

  it('invokes onDone and onRedo handlers when user clicks respective buttons', async () => {
    const onDone = vi.fn();
    const onRedo = vi.fn();

    render(
      <PlaybackReview
        audio={null}
        elapsedSec={45}
        xpReward={25}
        drillTitle="Describe This"
        onDone={onDone}
        onRedo={onRedo}
      />
    );

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    await act(async () => {
      fireEvent.click(doneBtn);
    });
    expect(onDone).toHaveBeenCalled();

    const redoBtn = screen.getByRole('button', { name: /Try again/i });
    await act(async () => {
      fireEvent.click(redoBtn);
    });
    expect(onRedo).toHaveBeenCalled();
  });
});
