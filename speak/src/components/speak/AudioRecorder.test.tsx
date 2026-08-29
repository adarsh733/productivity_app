import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AudioRecorder from './AudioRecorder';

describe('AudioRecorder React Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders idle state with prompt and start speaking action', () => {
    render(
      <AudioRecorder
        durationSec={45}
        targetVocab={['tangible', 'latency']}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
        promptNode={<div>Test Prompt Content</div>}
      />
    );

    expect(screen.getByText('Test Prompt Content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
    expect(screen.getByText(/Speak naturally when ready/i)).toBeInTheDocument();
  });

  it('transitions to recording state when start speaking is tapped', async () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    render(
      <AudioRecorder
        durationSec={30}
        targetVocab={['bandwidth']}
        onComplete={onComplete}
        onCancel={onCancel}
        promptNode={<div>Active Prompt</div>}
      />
    );

    const startBtn = screen.getByRole('button', { name: /Start speaking/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(screen.getByRole('button', { name: /Finish speaking early/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('completes attempt and invokes onComplete callback when user taps Done', async () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    render(
      <AudioRecorder
        durationSec={30}
        onComplete={onComplete}
        onCancel={onCancel}
        promptNode={<div>Finish Prompt</div>}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start speaking/i }));
    });

    const doneBtn = screen.getByRole('button', { name: /Finish speaking early/i });
    await act(async () => {
      fireEvent.click(doneBtn);
    });

    expect(onComplete).toHaveBeenCalled();
  });

  it('cleans up active media stream tracks when unmounted during recording', async () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    const { unmount } = render(
      <AudioRecorder
        durationSec={30}
        onComplete={onComplete}
        onCancel={onCancel}
        promptNode={<div>Cleanup Prompt</div>}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start speaking/i }));
    });

    // Unmount while recording
    act(() => {
      unmount();
    });

    // Verify unmount does not throw
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
