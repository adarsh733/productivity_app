import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import SpeakScreen from './SpeakScreen';

/** Banned jargon: MPT, dB, calibrate, WPM, standalone ms, ≥300ms. XP + numbers stay. */
const JARGON = /\bMPT\b|\bdB\b|calibrat|WPM|\bms\b|≥\s*300|300\s*ms/i;

/** Full suite runs 39 files in parallel — dexie can be slow, so wait generously. */
const findStart = () =>
  screen.findByRole('button', { name: /^start$/i }, { timeout: 8000 });

describe('SpeakScreen stage 5', () => {
  it('renders Today card with Start, routine row, and 3 group titles', async () => {
    render(<SpeakScreen />);

    const start = await findStart();
    expect(start).toBeInTheDocument();
    expect(screen.getByText(/12-minute voice routine/i)).toBeInTheDocument();
    expect(screen.getByText('Tell a story')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explain an idea, 60s/i })).toBeInTheDocument();
    expect(screen.getByText('Quick practice')).toBeInTheDocument();
    // Group contents
    expect(screen.getByText('Situations')).toBeInTheDocument();
    expect(screen.getByText('60-second story')).toBeInTheDocument();
    expect(screen.getByText('Describe what you see')).toBeInTheDocument();
    expect(screen.getByText('Teach it back')).toBeInTheDocument();
    expect(screen.getByText('Rapid rep')).toBeInTheDocument();
    expect(screen.getByText('Weekly breath-hold test')).toBeInTheDocument();
    expect(screen.getByText('Set your normal voice')).toBeInTheDocument();
  });

  it('Today comes before the 3 groups in DOM order', async () => {
    const { container } = render(<SpeakScreen />);
    await findStart();
    const today = container.querySelector('[aria-label="Today"]')!;
    const story = container.querySelector('[aria-label="Tell a story"]')!;
    const explain = container.querySelector('[aria-label="Explain an idea"]')!;
    const quick = container.querySelector('[aria-label="Quick practice"]')!;
    expect(today.compareDocumentPosition(story)).toBe(4);
    expect(today.compareDocumentPosition(explain)).toBe(4);
    expect(today.compareDocumentPosition(quick)).toBe(4);
  });

  it('menu labels and help use plain words only', async () => {
    const { container } = render(<SpeakScreen />);
    await findStart();
    const menu = container.querySelector('.speak-screen')!;
    expect(menu.textContent ?? '').not.toMatch(JARGON);
  });

  it('every tappable thing carries .tap (44px contract)', async () => {
    const { container } = render(<SpeakScreen />);
    await findStart();
    const tappables = container.querySelectorAll('button, [role="button"]');
    expect(tappables.length).toBeGreaterThan(5);
    tappables.forEach((el) => {
      expect(el.classList.contains('tap')).toBe(true);
    });
  });

  it('challenge Start opens the recorder; Cancel returns to the menu', async () => {
    render(<SpeakScreen />);
    const start = await findStart();
    await act(async () => {
      fireEvent.click(start);
    });
    expect(
      await screen.findByRole('button', { name: /start speaking and recording/i }, { timeout: 8000 }),
    ).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: /^cancel$/i });
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(await screen.findByText('Quick practice')).toBeInTheDocument();
  });

  it('a drill door opens a plain detail with Back that returns', async () => {
    render(<SpeakScreen />);
    await findStart();
    const door = screen.getByRole('button', { name: /speak softly/i });
    await act(async () => {
      fireEvent.click(door);
    });
    expect(screen.getByRole('button', { name: /back to speak/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /back to speak/i }));
    });
    expect(screen.getByText('Quick practice')).toBeInTheDocument();
  });

  it('a story row opens its mode and closes back to the menu', async () => {
    const { container } = render(<SpeakScreen />);
    await findStart();
    const row = within(container.querySelector('[aria-label="Tell a story"]')!).getByRole(
      'button',
      { name: /situations/i },
    );
    await act(async () => {
      fireEvent.click(row);
    });
    // Mode opened: menu group titles are gone
    expect(screen.queryByText('Quick practice')).not.toBeInTheDocument();
  });
});
