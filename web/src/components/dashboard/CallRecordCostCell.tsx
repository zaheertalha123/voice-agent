import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Call } from '@/services/supabase/calls';
import { formatCallCost } from './callFormatters';

interface CallRecordCostCellProps {
  call: Call;
  variant?: 'table' | 'card';
}

const GAP = 6;
const VIEWPORT_PAD = 8;

function placePopover(triggerEl: HTMLElement, popoverEl: HTMLElement) {
  const tr = triggerEl.getBoundingClientRect();
  const pw = Math.max(popoverEl.offsetWidth, 1);
  const ph = Math.max(popoverEl.offsetHeight, 1);

  let left = tr.left;
  if (variantAlignsRight(triggerEl)) {
    left = tr.right - pw;
  }
  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - pw - VIEWPORT_PAD));

  let top = tr.bottom + GAP;
  if (top + ph > window.innerHeight - VIEWPORT_PAD) {
    top = tr.top - ph - GAP;
  }
  if (top < VIEWPORT_PAD) {
    top = VIEWPORT_PAD;
  }

  popoverEl.style.position = 'fixed';
  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
  popoverEl.style.zIndex = '10050';
}

function variantAlignsRight(triggerEl: HTMLElement): boolean {
  return Boolean(triggerEl.closest('.call-records__cost-wrap--card'));
}

export function CallRecordCostCell({ call, variant = 'table' }: CallRecordCostCellProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const a = call.analytics;
  const hasBreakdown = Boolean(a?.llm || a?.tts || a?.stt || a?.daily);

  const wrapClass =
    variant === 'table' ? 'call-records__cost-wrap' : 'call-records__cost-wrap call-records__cost-wrap--card';

  const updatePosition = useCallback(() => {
    const t = triggerRef.current;
    const p = popoverRef.current;
    if (!t || !p || !open) return;
    placePopover(t, p);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const id = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(id);
  }, [open, updatePosition, a]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleTriggerEnter = () => {
    cancelClose();
    setOpen(true);
  };

  const handleTriggerLeave = () => {
    scheduleClose();
  };

  const handlePopoverEnter = () => {
    cancelClose();
  };

  const handlePopoverLeave = () => {
    setOpen(false);
  };

  const popoverContent =
    open &&
    hasBreakdown &&
    createPortal(
      <div
        ref={popoverRef}
        className="call-records__cost-popover call-records__cost-popover--portal"
        role="tooltip"
        onMouseEnter={handlePopoverEnter}
        onMouseLeave={handlePopoverLeave}
      >
        {a?.llm && (
          <div className="call-records__cost-row">
            <span>LLM</span>
            <span>${a.llm.cost_usd.toFixed(4)}</span>
          </div>
        )}
        {a?.tts && (
          <div className="call-records__cost-row">
            <span>TTS</span>
            <span>${a.tts.cost_usd.toFixed(4)}</span>
          </div>
        )}
        {a?.stt && (
          <div className="call-records__cost-row">
            <span>STT</span>
            <span>${a.stt.cost_usd.toFixed(4)}</span>
          </div>
        )}
        {a?.daily && (
          <div className="call-records__cost-row">
            <span>Daily</span>
            <span>${a.daily.total_cost_usd.toFixed(4)}</span>
          </div>
        )}
      </div>,
      document.body
    );

  return (
    <div className={wrapClass}>
      <span className="call-records__cost-value">{formatCallCost(call)}</span>
      {hasBreakdown && (
        <span
          ref={triggerRef}
          className="call-records__cost-trigger"
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleTriggerLeave}
          onFocus={() => {
            cancelClose();
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          tabIndex={0}
          role="button"
          aria-label="Show cost breakdown"
          aria-expanded={open}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </span>
      )}
      {popoverContent}
    </div>
  );
}
