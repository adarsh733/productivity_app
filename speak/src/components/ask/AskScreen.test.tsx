import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AskScreen from './AskScreen';
import { db } from '../../db/db';
import { askLearnedLines, saveAskTurn } from '../../features/learn/askLearned';
import { ASK_OFFLINE_LINE } from '../../features/learn/useAskBox';

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await Promise.all([db.meta.clear(), db.profile.clear(), db.outbox.clear()]);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('AskScreen', () => {
  it('shows the title, the one-line hint, an empty thread and the box', () => {
    render(<AskScreen />);
    expect(screen.getByTestId('ask-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ask' })).toBeInTheDocument();
    expect(
      screen.getByText('Tell the app anything: too easy, more about money, a topic you want.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ask-thread').children).toHaveLength(0);
    expect(screen.getByLabelText('Tell the app')).toBeInTheDocument();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('type, send: the reply and "Learned:" chips show, and the box is cleared', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        ok: true,
        task: 'tell_app',
        provider: 'groq',
        data: { reply: 'Done. More about money.', learned: [{ kind: 'more', theme: 'Money' }] },
      }),
    );
    render(<AskScreen />);

    const box = screen.getByLabelText('Tell the app') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'more about money' } });
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    expect(await screen.findByText('Done. More about money.')).toBeInTheDocument();
    const thread = screen.getByTestId('ask-thread');
    expect(thread.textContent).toContain('more about money');
    expect(screen.getByTestId('ask-chip').textContent).toBe('Learned: More cards about Money.');
    await waitFor(() => expect(box.value).toBe(''));
    expect(screen.queryByTestId('ask-error')).toBeNull();
    expect((await askLearnedLines()).map((l) => l.text)).toEqual(['More cards about Money.']);
  });

  it('Enter sends, Shift+Enter does not', async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: true, task: 'tell_app', provider: 'groq', data: { reply: 'Ok.', learned: [] } }),
    );
    render(<AskScreen />);
    const box = screen.getByLabelText('Tell the app');
    fireEvent.change(box, { target: { value: 'hi' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('Ok.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on an error the plain line shows and his words stay in the box', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<AskScreen />);
    const box = screen.getByLabelText('Tell the app') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'too easy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect((await screen.findByTestId('ask-error')).textContent).toBe(ASK_OFFLINE_LINE);
    expect(box.value).toBe('too easy');
  });

  it('lists the stored thread oldest first, without chips he removed', async () => {
    await saveAskTurn('first', { reply: 'One.', learned: [{ kind: 'new_theme', theme: 'Cricket' }] }, 1000);
    await saveAskTurn('second', { reply: 'Two.', learned: [] }, 2000);
    render(<AskScreen />);

    await waitFor(() => expect(screen.getAllByTestId('ask-turn')).toHaveLength(2));
    const turns = screen.getAllByTestId('ask-turn');
    expect(turns[0]!.textContent).toContain('first');
    expect(turns[1]!.textContent).toContain('second');
    expect(screen.getByTestId('ask-chip').textContent).toBe('Learned: New topic: Cricket.');
  });
});
