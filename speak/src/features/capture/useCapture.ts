import { useCallback, useState } from 'react';
import { useInbox } from '../inbox/useInbox';

export interface UseCaptureReturn {
  isOpen: boolean;
  openCapture: () => void;
  closeCapture: () => void;
  draft: string;
  setDraft: (val: string) => void;
  save: () => Promise<void>;
  discard: (id: string) => Promise<void>;
  liveItems: ReturnType<typeof useInbox>['items'];
}

export function useCapture(): UseCaptureReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inbox = useInbox();

  const openCapture = useCallback(() => setIsOpen(true), []);
  const closeCapture = useCallback(() => setIsOpen(false), []);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await inbox.add(trimmed);
    setDraft('');
  }, [draft, inbox]);

  const discard = useCallback(
    async (id: string) => {
      await inbox.discard(id);
    },
    [inbox],
  );

  const liveItems = inbox.items.filter((item) => item.status !== 'discarded');

  return {
    isOpen,
    openCapture,
    closeCapture,
    draft,
    setDraft,
    save,
    discard,
    liveItems,
  };
}
