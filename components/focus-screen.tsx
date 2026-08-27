"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppTabBar } from "@/components/app-tab-bar";
import { MobileShell } from "@/components/mobile-shell";
import { Toast } from "@/components/toast";
import {
  FOCUS_DURATIONS_MS,
  FOCUS_MODE_LABELS,
  FOCUS_MODES,
  FOCUS_SESSIONS_PER_SET,
  createDefaultFocusTimer,
  completeFocusTimer,
  createFocusTodo,
  focusProgress,
  formatFocusDuration,
  pauseFocusTimer,
  readFocusTimer,
  readFocusTodos,
  resetFocusTimer,
  sortFocusTodos,
  startFocusTimer,
  switchFocusMode,
  syncRunningTimer,
  writeFocusTimer,
  writeFocusTodos,
  type FocusMode,
  type FocusTimerState,
  type FocusTodo,
} from "@/lib/focus";

const RING_RADIUS = 96;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function FocusScreen() {
  const [timer, setTimer] = useState<FocusTimerState>(createDefaultFocusTimer);
  const [todos, setTodos] = useState<FocusTodo[]>([]);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTimer(syncRunningTimer(readFocusTimer()));
    setTodos(readFocusTodos());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeFocusTimer(timer);
  }, [hydrated, timer]);

  useEffect(() => {
    if (!hydrated) return;
    writeFocusTodos(todos);
  }, [hydrated, todos]);

  useEffect(() => {
    if (!hydrated || timer.status !== "running" || timer.remainingMs > 0) return;
    const completed = completeFocusTimer(timer);
    setTimer(completed.state);
    setToast(completed.toast);
  }, [hydrated, timer]);

  useEffect(() => {
    if (!hydrated) return;

    function tick() {
      setTimer((current) => syncRunningTimer(current));
    }

    tick();
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [hydrated]);

  const progress = focusProgress(timer);
  const remainingLabel = formatFocusDuration(timer.remainingMs);
  const visibleTodos = useMemo(() => sortFocusTodos(todos), [todos]);
  const doneCount = todos.filter((todo) => todo.done).length;

  const startLabel = timer.status === "paused" ? "다시 시작" : "시작";

  const updateTimer = useCallback((updater: (current: FocusTimerState) => FocusTimerState) => {
    setTimer((current) => updater(current));
  }, []);

  function handleModeChange(mode: FocusMode) {
    updateTimer((current) => switchFocusMode(current, mode));
  }

  function handleStart() {
    updateTimer((current) => startFocusTimer(current));
  }

  function handlePause() {
    updateTimer((current) => pauseFocusTimer(current));
  }

  function handleReset() {
    updateTimer((current) => resetFocusTimer(current));
  }

  function addTodo() {
    const created = createFocusTodo(draft);
    if (!created) return;
    setTodos((current) => [...current, created]);
    setDraft("");
  }

  function toggleTodo(id: string) {
    setTodos((current) => current.map((todo) => (
      todo.id === id ? { ...todo, done: !todo.done } : todo
    )));
  }

  function removeTodo(id: string) {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }

  return (
    <MobileShell className="focus-screen">
      <header className="focus-header">
        <strong>집중</strong>
      </header>

      <div className="focus-content">
        <section className="home-card focus-timer-card" aria-label="뽀모도로 타이머">
          <div className="focus-mode-tabs" role="tablist" aria-label="타이머 모드">
            {FOCUS_MODES.map((mode) => {
              const selected = timer.mode === mode;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={selected ? "active" : undefined}
                  onClick={() => handleModeChange(mode)}
                  key={mode}
                >
                  {FOCUS_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>

          <div
            className="focus-timer-ring"
            role="timer"
            aria-label={`${FOCUS_MODE_LABELS[timer.mode]} ${remainingLabel} 남음`}
          >
            <svg viewBox="0 0 220 220" aria-hidden="true">
              <circle className="focus-timer-track" cx="110" cy="110" r={RING_RADIUS} />
              <circle
                className="focus-timer-progress"
                cx="110"
                cy="110"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
              />
            </svg>
            <div className="focus-timer-readout">
              <span className="focus-timer-mode">{FOCUS_MODE_LABELS[timer.mode]}</span>
              <strong>{remainingLabel}</strong>
            </div>
          </div>

          <div className="focus-session-dots" aria-label={`이번 세트 ${timer.completedInSet}회 완료`}>
            {Array.from({ length: FOCUS_SESSIONS_PER_SET }, (_, index) => (
              <i
                key={index}
                className={index < timer.completedInSet ? "done" : undefined}
                aria-hidden="true"
              />
            ))}
          </div>

          <div className="focus-timer-actions">
            {timer.status === "running" ? (
              <button type="button" className="focus-timer-primary secondary" onClick={handlePause}>
                일시정지
              </button>
            ) : (
              <button type="button" className="focus-timer-primary" onClick={handleStart}>
                {startLabel}
              </button>
            )}
            <button
              type="button"
              className="focus-timer-reset"
              onClick={handleReset}
              disabled={timer.status === "idle" && timer.remainingMs === FOCUS_DURATIONS_MS[timer.mode]}
            >
              초기화
            </button>
          </div>
        </section>

        <section className="home-card focus-todo-card" aria-label="할 일">
          <header className="focus-todo-heading">
            <strong>할 일</strong>
            <span>{todos.length === 0 ? "아직 없음" : `${doneCount}/${todos.length} 완료`}</span>
          </header>

          {visibleTodos.length === 0 ? (
            <p className="focus-todo-empty">할 일을 적고, 타이머와 함께 하나씩 끝내보세요.</p>
          ) : (
            <ul className="focus-todo-list">
              {visibleTodos.map((todo) => (
                <li key={todo.id} className={todo.done ? "done" : undefined}>
                  <button
                    type="button"
                    className="focus-todo-check"
                    aria-pressed={todo.done}
                    aria-label={todo.done ? `${todo.text} 완료 취소` : `${todo.text} 완료`}
                    onClick={() => toggleTodo(todo.id)}
                  >
                    <Image
                      src={todo.done ? "/icons/checkbox-checked.svg" : "/icons/checkbox-unchecked.svg"}
                      alt=""
                      width={20}
                      height={20}
                    />
                  </button>
                  <span>{todo.text}</span>
                  <button
                    type="button"
                    className="focus-todo-delete"
                    aria-label={`${todo.text} 삭제`}
                    onClick={() => removeTodo(todo.id)}
                  >
                    <Image src="/icons/trash-outline.svg" alt="" width={18} height={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="focus-todo-composer"
            onSubmit={(event) => {
              event.preventDefault();
              addTodo();
            }}
          >
            <label className="sr-only" htmlFor="focus-todo-input">할 일 추가</label>
            <input
              id="focus-todo-input"
              className="focus-todo-input"
              value={draft}
              maxLength={80}
              placeholder="할 일을 입력하세요"
              autoComplete="off"
              enterKeyHint="done"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={!draft.trim()}>추가</button>
          </form>
        </section>
      </div>

      {toast ? (
        <Toast
          message={toast}
          onDismiss={() => setToast("")}
          aboveNavigation
          showIcon
        />
      ) : null}

      <AppTabBar active="focus" />
    </MobileShell>
  );
}
