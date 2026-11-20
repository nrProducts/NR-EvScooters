import { useSyncExternalStore } from "react";

/**
 * "Install app" support for the admin console.
 *
 * Chrome/Edge fire `beforeinstallprompt` once, early, when the page qualifies as
 * installable. We capture it at module load (this file is imported from main.tsx,
 * before React mounts) and hold it until the header button asks for the prompt.
 *
 * There is deliberately no uninstall: browsers expose no API to remove an
 * installed web app from page code. Once installed, the app window's own title
 * bar has an "Uninstall" button.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Running inside the installed app window (or iOS home-screen mode). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the event so our own button can fire it later
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => deferredPrompt !== null && !isStandalone();

/** `canInstall` is true only when the browser is ready to show its install prompt. */
export function usePwaInstall() {
  const canInstall = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const install = async () => {
    const evt = deferredPrompt;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    // A prompt can only be used once, whatever the outcome; Chrome fires a new
    // beforeinstallprompt later if the person dismissed it.
    deferredPrompt = null;
    notify();
  };

  return { canInstall, install };
}
