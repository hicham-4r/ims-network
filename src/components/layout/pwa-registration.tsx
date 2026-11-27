"use client";
import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    // No service worker in next dev; production builds can be checked locally.
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/ims-sw.js", { scope:"/", updateViaCache:"none" }).catch(() => { /* Browser install remains optional. */ });
  }, []);
  return null;
}
