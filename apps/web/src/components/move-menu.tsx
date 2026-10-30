'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { STATUSES, STATUS_LABELS, type Status } from '@/lib/types';

const MENU_WIDTH = 180;
const MENU_HEIGHT_ESTIMATE = 230;

// Keyboard route to every column: the menu opens with focus on the first column, arrows move between them,
// Enter picks one, and Escape returns focus to the trigger. Mouse and touch users get the same menu.
// The menu is portalled to <body> with fixed positioning so the scrolling board cannot clip it.
export function MoveMenu({ current, onMove }: { current: Status; onMove: (status: Status) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      // Open below the trigger, or above it when there is no room underneath.
      const flipUp = rect.bottom + MENU_HEIGHT_ESTIMATE > window.innerHeight;
      setPosition({
        left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
        top: flipUp ? rect.top - 6 : rect.bottom + 6,
        transform: flipUp ? 'translateY(-100%)' : undefined,
      });
    }
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  }

  return (
    <div
      className="move-menu"
      ref={rootRef}
      // A press on the menu must not also open the task panel behind it.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="move-trigger"
        data-testid="move-to"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        Move to
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              className="move-popover"
              role="menu"
              aria-label="Move to column"
              ref={menuRef}
              style={position}
              onKeyDown={onMenuKeyDown}
            >
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  role="menuitem"
                  className="move-item"
                  disabled={status === current}
                  onClick={() => {
                    setOpen(false);
                    onMove(status);
                  }}
                >
                  {STATUS_LABELS[status]}
                  {status === current ? <span className="move-current">Current</span> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
