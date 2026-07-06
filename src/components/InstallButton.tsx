"use client";
import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";

type Platform = "ios" | "android" | "desktop" | "other";

// Chrome/Edge fire this before install becomes available; capturing it lets us
// offer a one-tap install instead of manual steps.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  // iPadOS 13+ reports as Mac, so also check for a touch-capable "Mac"
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
    return "ios";
  if (/android/.test(ua)) return "android";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "other";
}

export default function InstallButton() {
  // Start hidden so the button never flashes for users already in the PWA;
  // the effect reveals it only if we're in a normal browser tab.
  const [standalone, setStandalone] = useState(true);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    setPlatform(detectPlatform());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Only render in a normal browser, never inside the installed PWA.
  if (standalone) return null;

  async function nativeInstall() {
    if (!deferred) return;
    setInstalling(true);
    await deferred.prompt();
    await deferred.userChoice;
    setInstalling(false);
    setDeferred(null);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ink/20 bg-surface px-3 py-1.5 text-sm font-medium hover:border-ink/40"
      >
        Install app
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold">Install PlanPal</h2>
            <p className="mb-4 text-sm text-ink/60">
              Add PlanPal to your home screen or dock for a full-screen, app-like experience that also works offline.
            </p>

            {deferred ? (
              <>
                <button
                  onClick={nativeInstall}
                  disabled={installing}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-charcoal p-3 font-medium text-white hover:bg-charcoal/90 disabled:opacity-50"
                >
                  {installing && <Spinner className="h-4 w-4" />}
                  {installing ? "Installing…" : "Install now"}
                </button>
                <p className="text-xs text-ink/50">
                  Or do it manually: open your browser menu and choose “Install app” / “Add to Home screen”.
                </p>
              </>
            ) : (
              <Steps platform={platform} />
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-ink/20 px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Steps({ platform }: { platform: Platform }) {
  if (platform === "ios") {
    return (
      <Instruction
        heading="On iPhone / iPad (Safari)"
        steps={[
          "Make sure the page is open in Safari.",
          "Tap the Share button (the square with an up arrow) in the toolbar.",
          "Scroll down and tap “Add to Home Screen”.",
          "Tap “Add” in the top corner."
        ]}
      />
    );
  }
  if (platform === "android") {
    return (
      <Instruction
        heading="On Android (Chrome)"
        steps={[
          "Tap the ⋮ menu in the top-right of Chrome.",
          "Tap “Add to Home screen” or “Install app”.",
          "Confirm with “Install” / “Add”."
        ]}
      />
    );
  }
  if (platform === "desktop") {
    return (
      <Instruction
        heading="On desktop (Chrome / Edge)"
        steps={[
          "Look for the install icon at the right end of the address bar (a monitor with a down arrow, or ⊕).",
          "Or open the ⋮ menu and choose “Install PlanPal…”.",
          "Click “Install”.",
          "Safari (macOS): File → Add to Dock."
        ]}
      />
    );
  }
  return (
    <Instruction
      heading="Install"
      steps={[
        "Open your browser’s menu.",
        "Look for “Install app”, “Add to Home screen”, or “Add to Dock”.",
        "Follow the prompt to confirm."
      ]}
    />
  );
}

function Instruction({ heading, steps }: { heading: string; steps: string[] }) {
  return (
    <div className="rounded-xl bg-ink/5 p-4">
      <p className="mb-2 text-sm font-semibold">{heading}</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink/80">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
