// Toggle Steam's on-screen keyboard from outside Steam's input focus.
//
// Steam has no documented API for this; its gamepad UI window keeps a
// VirtualKeyboardManager (typed `any` in @decky/ui). Try the method names
// other Decky plugins use, remember which worked, and log the manager's
// method list once so a Steam update can be followed.
let shown = false;
let described = false;

function manager(): any {
  const ws = (window as any).SteamUIStore?.WindowStore;
  const inst = ws?.GamepadUIMainWindowInstance ?? ws?.GetOverlayInstanceWithFallback?.();
  return inst?.VirtualKeyboardManager ?? inst?.m_VirtualKeyboardManager ?? null;
}

function methods(o: any): string[] {
  const out = new Set<string>();
  for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
    for (const k of Object.getOwnPropertyNames(p)) if (/keyboard|visible|shown|show|hide/i.test(k)) out.add(k);
  return [...out];
}

function isShowing(vkm: any): boolean | null {
  for (const k of ["IsShowingVirtualKeyboard", "BIsVirtualKeyboardOpen", "IsVirtualKeyboardOpen"]) {
    const v = vkm[k];
    if (typeof v === "function") { try { return !!v.call(vkm); } catch { /* next */ } }
    if (v && typeof v === "object" && "Value" in v) return !!v.Value;
    if (typeof v === "boolean") return v;
  }
  for (const k of ["m_bIsVirtualKeyboardOpen", "m_bIsInlineVirtualKeyboardOpen", "m_bVirtualKeyboardVisible"]) {
    const v = vkm[k];
    if (v && typeof v === "object" && "Value" in v) return !!v.Value;
    if (typeof v === "boolean") return v;
  }
  return null;
}

function call(vkm: any, names: [string, any[]][]): string | null {
  for (const [n, args] of names) {
    if (typeof vkm[n] === "function") {
      try { vkm[n](...args); return n; } catch { /* try next */ }
    }
  }
  return null;
}

export function toggleKeyboard(log: (m: string) => void): void {
  const vkm = manager();
  if (!vkm) { log("keyboard: VirtualKeyboardManager not found"); return; }
  if (!described) { described = true; log(`keyboard: manager methods ${methods(vkm).join(", ")}`); }
  const state = isShowing(vkm);
  const open = state === null ? !shown : !state;
  const used = open
    ? call(vkm, [["SetVirtualKeyboardVisible", []], ["SetVirtualKeyboardShownInternal", [true]], ["ShowVirtualKeyboard", []]])
    : call(vkm, [["SetVirtualKeyboardHidden", []], ["SetVirtualKeyboardShownInternal", [false]], ["HideVirtualKeyboard", [0]]]);
  shown = open;
  log(`keyboard: ${open ? "open" : "close"} via ${used ?? "nothing (no known method)"}; state was ${state}`);
}
