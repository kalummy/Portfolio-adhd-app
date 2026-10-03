/** SystemBars owns native IME sizing. Some WebViews resize without revealing focus. */
export function installKeyboardViewport() {
  let visible = false;
  let frame = 0;
  const adjusted = new Map<HTMLElement, { before: number; after: number; input: HTMLElement }>();

  function reveal() {
    frame = 0;
    if (!visible) return;
    const input = document.activeElement;
    if (!(input instanceof HTMLElement) || !input.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]')) return;
    const rect = input.getBoundingClientRect();
    const viewport = window.visualViewport;
    let top = viewport?.offsetTop ?? 0;
    let bottom = top + (viewport?.height ?? window.innerHeight);

    // Existing fixed/sticky UI keeps its position. Use its measured bounds,
    // including SystemBars CSS safe areas, rather than assumed header/IME sizes.
    for (const element of document.querySelectorAll<HTMLElement>('.flow-header, .my-home-subheader, .home-header, .bottom-actions, .bottom-navigation, .app-toast')) {
      const style = getComputedStyle(element);
      if (!['fixed', 'sticky'].includes(style.position) || style.display === 'none') continue;
      const overlay = element.getBoundingClientRect();
      if (!overlay.height || overlay.right <= rect.left || overlay.left >= rect.right) continue;
      // The search field is deliberately inside the header's visual region.
      if (input.closest('.search-form') && element.matches('.flow-header') && rect.top >= overlay.top && rect.bottom <= overlay.bottom) continue;
      if (overlay.top <= top && overlay.bottom > top) top = overlay.bottom;
      else if (overlay.top > top && overlay.top < bottom) bottom = overlay.top;
    }
    const delta = rect.bottom > bottom ? rect.bottom - bottom : rect.top < top ? rect.top - top : 0;
    if (!delta) return;
    let scroller = input.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    scroller ??= document.scrollingElement as HTMLElement | null;
    if (!scroller) return;
    const previous = adjusted.get(scroller);
    const before = previous?.before ?? scroller.scrollTop;
    scroller.scrollBy({ top: delta, behavior: 'instant' });
    adjusted.set(scroller, { before, after: scroller.scrollTop, input });
  }
  function schedule() {
    if (visible && !frame) frame = requestAnimationFrame(reveal);
  }
  document.addEventListener('focusin', schedule);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  return {
    show() { visible = true; schedule(); },
    hide() {
      visible = false;
      cancelAnimationFrame(frame);
      frame = 0;
      for (const [scroller, saved] of adjusted) {
        // Restore only our scroll, on the same screen; keep subsequent user scrolls.
        if (saved.input.isConnected && Math.abs(scroller.scrollTop - saved.after) <= 1) scroller.scrollTop = saved.before;
      }
      adjusted.clear();
    },
  };
}
