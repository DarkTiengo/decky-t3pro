// Battery pill in the Game Mode top bar, next to the clock.
//
// Decky has no API for the top bar, so this is a DOM insertion: find the
// clock in the gamepad UI header (text like "21:07", near the top-right),
// put a small "🎮 75%" element before it, and keep it there with a
// MutationObserver (Steam re-renders the header). If Steam changes its UI the
// pill just doesn't show; the panel keeps working. What was found is reported
// to the backend log so the placement can be adjusted.
import { findSP } from "@decky/ui";

const ID = "t3pro-topbar-battery";
const CLOCK = /^\s*\d{1,2}:\d{2}(\s?[AaPp]\.?\s?[Mm]\.?)?\s*$/;

let observer: MutationObserver | null = null;
let current: { text: string; color: string; visible: boolean } = { text: "", color: "#fff", visible: false };
let reported = false;
let logFn: ((msg: string) => void) | null = null;

function doc(): Document | null {
  try {
    return findSP()?.document ?? null;
  } catch {
    return null;
  }
}

function describe(el: Element | null, depth = 4): string {
  const parts: string[] = [];
  for (let e = el, i = 0; e && i < depth; e = e.parentElement, i++) {
    parts.push(`${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ").slice(0, 3).join(".")}`);
  }
  return parts.join(" < ");
}

function findClock(d: Document): Element | null {
  const w = d.defaultView?.innerWidth ?? 1920;
  let best: Element | null = null;
  let bestRight = -1;
  const all = d.body.querySelectorAll("div, span");
  for (const el of Array.from(all)) {
    if (el.children.length > 0) continue;
    const t = el.textContent ?? "";
    if (!CLOCK.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > 90 || r.left < w * 0.5 || r.width === 0) continue;
    if (r.right > bestRight) {
      best = el;
      bestRight = r.right;
    }
  }
  return best;
}

function ensure(): void {
  const d = doc();
  if (!d || !d.body) return;
  let pill = d.getElementById(ID);
  if (!current.visible) {
    pill?.remove();
    return;
  }
  if (!pill) {
    const clock = findClock(d);
    if (!clock) {
      if (!reported && logFn) {
        reported = true;
        logFn("topbar: clock not found in the Steam UI header");
      }
      return;
    }
    // insert before the clock's own box so it lines up with the other icons
    const anchor = clock.parentElement && clock.parentElement.children.length === 1 ? clock.parentElement : clock;
    pill = d.createElement("div");
    pill.id = ID;
    pill.style.cssText =
      "display:flex;align-items:center;gap:4px;margin-right:12px;font-size:14px;" +
      "font-weight:600;white-space:nowrap;align-self:center;pointer-events:none;";
    anchor.parentElement?.insertBefore(pill, anchor);
    if (!reported && logFn) {
      reported = true;
      logFn(`topbar: inserted before ${describe(anchor)}`);
    }
  }
  pill.textContent = current.text;
  (pill as HTMLElement).style.color = current.color;
}

export function startTopbar(log: (msg: string) => void): void {
  logFn = log;
  const d = doc();
  if (!d || !d.body || observer) return;
  let pending = false;
  observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (current.visible && !d.getElementById(ID)) ensure();
    }, 500);
  });
  observer.observe(d.body, { childList: true, subtree: true });
  ensure();
}

export function updateTopbar(battery: number, charging: boolean, present: boolean, color: string): void {
  current = {
    text: `🎮 ${battery}%${charging ? " ⚡" : ""}`,
    color,
    visible: present && battery >= 0,
  };
  ensure();
}

export function stopTopbar(): void {
  observer?.disconnect();
  observer = null;
  doc()?.getElementById(ID)?.remove();
}
