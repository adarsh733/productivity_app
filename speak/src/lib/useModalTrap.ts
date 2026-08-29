import { useEffect, useRef } from 'react';

export interface UseModalTrapOptions {
  isOpen: boolean;
  onClose: () => void;
  modalId?: string;
  enableHistory?: boolean;
}

export function useModalTrap<T extends HTMLElement = HTMLElement>({
  isOpen,
  onClose,
  modalId,
  enableHistory = true,
}: UseModalTrapOptions) {
  const containerRef = useRef<T | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // 1. Focus restoration & initial focus
  useEffect(() => {
    if (!isOpen) return;
    triggerElementRef.current = (document.activeElement as HTMLElement) ?? null;

    const container = containerRef.current;
    if (container) {
      // Find first focusable element
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        container.focus();
      }
    }

    return () => {
      triggerElementRef.current?.focus?.();
    };
  }, [isOpen]);

  // 2. Escape key & Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const container = containerRef.current;
        if (!container) return;

        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  // 3. Browser back popstate handling
  useEffect(() => {
    if (!isOpen || !enableHistory) return;

    const key = modalId ?? `modal-${Date.now()}`;
    if (window.history.state?.modalOpen !== key) {
      window.history.pushState({ modalOpen: key }, '');
    }

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, enableHistory, modalId, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return {
    containerRef,
    handleBackdropClick,
  };
}
