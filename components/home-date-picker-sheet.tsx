"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { HomeCalendar } from "@/components/home-calendar";
import type { MedicationIntakeRecord, MoodRecord } from "@/lib/types";

type HomeDatePickerSheetProps = {
  visibleMonthKey: string;
  pendingDateKey: string;
  todayKey: string;
  intakeRecords: MedicationIntakeRecord[];
  moodRecords: MoodRecord[];
  onSelect: (dateKey: string) => void;
  onMoveMonth: (amount: number) => void;
  onToday: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

const CLOSE_DURATION_MS = 240;
const DRAG_DISMISS_RATIO = 0.28;
const FLICK_DISMISS_VELOCITY = 0.8;
const FLICK_MIN_DISTANCE = 24;

export function HomeDatePickerSheet({
  visibleMonthKey,
  pendingDateKey,
  todayKey,
  intakeRecords,
  moodRecords,
  onSelect,
  onMoveMonth,
  onToday,
  onConfirm,
  onClose,
}: HomeDatePickerSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const dragRef = useRef<{
    source: "pointer" | "touch";
    id: number;
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    offset: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isEntered, setIsEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const requestClose = useCallback((action: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;

    if (reducedMotionRef.current) {
      action();
      return;
    }

    setIsDragging(false);
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(action, CLOSE_DURATION_MS);
  }, []);

  const startDrag = useCallback((source: "pointer" | "touch", id: number, y: number, time: number) => {
    if (closingRef.current) return;
    dragRef.current = {
      source,
      id,
      startY: y,
      lastY: y,
      lastTime: time,
      velocity: 0,
      offset: 0,
    };
    setIsDragging(true);
  }, []);

  const moveDrag = useCallback((source: "pointer" | "touch", id: number, y: number, time: number) => {
    const drag = dragRef.current;
    if (!drag || drag.source !== source || drag.id !== id) return false;

    const nextOffset = Math.max(0, y - drag.startY);
    const elapsed = Math.max(1, time - drag.lastTime);
    drag.velocity = (y - drag.lastY) / elapsed;
    drag.lastY = y;
    drag.lastTime = time;
    drag.offset = nextOffset;
    setDragOffset(nextOffset);
    return nextOffset > 0;
  }, []);

  const finishDrag = useCallback((source: "pointer" | "touch", id: number, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.source !== source || drag.id !== id) return;
    dragRef.current = null;

    const sheetHeight = dialogRef.current?.getBoundingClientRect().height ?? 598;
    const dismissByDistance = drag.offset >= sheetHeight * DRAG_DISMISS_RATIO;
    const dismissByFlick =
      drag.offset >= FLICK_MIN_DISTANCE &&
      drag.velocity >= FLICK_DISMISS_VELOCITY;

    if (!cancelled && (dismissByDistance || dismissByFlick)) {
      requestClose(onClose);
      return;
    }

    setIsDragging(false);
    setDragOffset(0);
  }, [onClose, requestClose]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotionRef.current) {
      setIsEntered(true);
      return;
    }

    enterFrameRef.current = window.requestAnimationFrame(() => {
      enterFrameRef.current = window.requestAnimationFrame(() => setIsEntered(true));
    });
    return () => {
      if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const currentHeader = headerRef.current;
    if (!currentHeader) return;
    const dragHeader: HTMLDivElement = currentHeader;
    const supportsPointerEvents = "PointerEvent" in window;

    function touchById(touches: TouchList, id: number) {
      return Array.from(touches).find((touch) => touch.identifier === id);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      event.preventDefault();
      startDrag("touch", touch.identifier, touch.clientY, event.timeStamp);
    }

    function handleTouchMove(event: TouchEvent) {
      const drag = dragRef.current;
      if (!drag || drag.source !== "touch") return;
      const touch = touchById(event.touches, drag.id);
      if (!touch) return;
      if (moveDrag("touch", drag.id, touch.clientY, event.timeStamp)) event.preventDefault();
    }

    function handleTouchEnd(event: TouchEvent) {
      const drag = dragRef.current;
      if (!drag || drag.source !== "touch") return;
      if (touchById(event.changedTouches, drag.id)) finishDrag("touch", drag.id);
    }

    function handleTouchCancel() {
      const drag = dragRef.current;
      if (drag?.source === "touch") finishDrag("touch", drag.id, true);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!event.isPrimary || closingRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      try {
        dragHeader.setPointerCapture(event.pointerId);
      } catch {
        // The window listeners below still keep the drag continuous.
      }
      startDrag("pointer", event.pointerId, event.clientY, event.timeStamp);
    }

    function handlePointerMove(event: PointerEvent) {
      if (moveDrag("pointer", event.pointerId, event.clientY, event.timeStamp)) {
        event.preventDefault();
      }
    }

    function handlePointerEnd(event: PointerEvent, cancelled = false) {
      finishDrag("pointer", event.pointerId, cancelled);
      if (dragHeader.hasPointerCapture(event.pointerId)) {
        dragHeader.releasePointerCapture(event.pointerId);
      }
    }

    function handlePointerCancel(event: PointerEvent) {
      handlePointerEnd(event, true);
    }

    if (supportsPointerEvents) {
      dragHeader.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerEnd);
      window.addEventListener("pointercancel", handlePointerCancel);
    } else {
      dragHeader.addEventListener("touchstart", handleTouchStart, { passive: false });
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      window.addEventListener("touchcancel", handleTouchCancel);
    }
    return () => {
      if (supportsPointerEvents) {
        dragHeader.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerEnd);
        window.removeEventListener("pointercancel", handlePointerCancel);
      } else {
        dragHeader.removeEventListener("touchstart", handleTouchStart);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
        window.removeEventListener("touchcancel", handleTouchCancel);
      }
    };
  }, [finishDrag, moveDrag, startDrag]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    dialog?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose(onClose);
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose, requestClose]);

  const dragProgress = Math.min(1, dragOffset / 598);
  const transition = isDragging
    ? "none"
    : `transform ${CLOSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  const sheetStyle: CSSProperties = {
    transform: isClosing
      ? "translate3d(0, 100%, 0)"
      : isDragging || dragOffset > 0
        ? `translate3d(0, ${dragOffset}px, 0)`
        : isEntered
          ? "translate3d(0, 0, 0)"
          : "translate3d(0, 100%, 0)",
    transition,
  };
  const dimmedStyle: CSSProperties = {
    opacity: isClosing || !isEntered ? 0 : 1 - dragProgress,
    transition: !isDragging
      ? `opacity ${CLOSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      : "none",
  };

  return (
    <div className="home-date-picker-layer">
      <button
        type="button"
        className="home-date-picker-dimmed"
        aria-label="날짜 선택 닫기"
        style={dimmedStyle}
        onClick={() => requestClose(onClose)}
      />
      <div
        ref={dialogRef}
        className="home-date-picker-sheet"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="home-date-picker-title"
        style={sheetStyle}
      >
        <div
          ref={headerRef}
          className="home-date-picker-header"
        >
          <div className="home-date-picker-handle" aria-hidden="true" />
          <h2 id="home-date-picker-title">날짜를 선택해주세요</h2>
        </div>
        <HomeCalendar
          visibleMonthKey={visibleMonthKey}
          pendingDateKey={pendingDateKey}
          todayKey={todayKey}
          intakeRecords={intakeRecords}
          moodRecords={moodRecords}
          onSelect={onSelect}
          onMoveMonth={onMoveMonth}
          onToday={onToday}
        />
        <div className="home-date-picker-footer">
          <div className="home-date-picker-actions">
            <button type="button" onClick={() => requestClose(onConfirm)}>확인</button>
          </div>
          <div className="home-date-picker-homebar" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
