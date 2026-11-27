"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (target: HTMLElement, options: {
    sitekey: string; action: string; callback: (token: string) => void;
    "expired-callback": () => void; "error-callback": () => void;
    "timeout-callback": () => void;
  }) => string;
  remove: (id: string) => void;
};

function widgetApi() {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

export function TurnstileWidget({ action, onToken }: {
  action: "signup" | "recovery"; onToken: (token: string | null) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const api = widgetApi();
    if (!ready || !api || !target.current || !turnstileSiteKey) return;
    let active = true;
    const invalidate = () => { if (active) onToken(null); };
    const fail = () => { if (active) { onToken(null); setError(true); } };
    let id: string;
    try {
      id = api.render(target.current, {
        sitekey: turnstileSiteKey, action,
        callback: token => { if (active) { setError(false); onToken(token); } },
        "expired-callback": invalidate, "timeout-callback": invalidate,
        "error-callback": fail,
      });
    } catch {
      // Defer the failure callback so React does not synchronously update state in the effect.
      queueMicrotask(fail);
      return () => { active = false; };
    }
    return () => { active = false; api.remove(id); };
  }, [ready, action, onToken]);
  if (!turnstileSiteKey) return null;
  return <div className="space-y-2">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive" onReady={() => setReady(true)} onError={() => { setError(true); onToken(null); }} />
    <div ref={target} />
    {error ? <p role="alert" className="text-sm text-muted-foreground">Security challenge unavailable. Reload the page to retry.</p> : null}
  </div>;
}
