"use client";

import { useEffect } from "react";

const DEV_CHUNK_RELOAD_KEY = "__agentarxiv_dev_chunk_reload__";
const DEV_CHUNK_RELOAD_WINDOW_MS = 15_000;

function normalizeErrorMessage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;

    return typeof message === "string" ? message : "";
  }

  return "";
}

function isChunkLoadFailure(message: string): boolean {
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Failed to load chunk") ||
    message.includes("/_next/static/chunks/")
  );
}

function markReloadAttempt(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const rawAttempt = window.sessionStorage.getItem(DEV_CHUNK_RELOAD_KEY);

    if (rawAttempt) {
      const previousAttempt = JSON.parse(rawAttempt) as {
        path?: unknown;
        timestamp?: unknown;
      };

      if (
        previousAttempt.path === window.location.pathname &&
        typeof previousAttempt.timestamp === "number" &&
        Date.now() - previousAttempt.timestamp < DEV_CHUNK_RELOAD_WINDOW_MS
      ) {
        return false;
      }
    }

    window.sessionStorage.setItem(
      DEV_CHUNK_RELOAD_KEY,
      JSON.stringify({
        path: window.location.pathname,
        timestamp: Date.now(),
      }),
    );
  } catch {
    return true;
  }

  return true;
}

export function DevChunkRecovery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const recover = () => {
      if (!markReloadAttempt()) {
        return;
      }

      window.location.reload();
    };

    const handleWindowError = (event: ErrorEvent | Event) => {
      if (event instanceof ErrorEvent) {
        if (isChunkLoadFailure(normalizeErrorMessage(event.error ?? event.message))) {
          recover();
        }

        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLScriptElement &&
        target.src.includes("/_next/static/chunks/")
      ) {
        recover();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(normalizeErrorMessage(event.reason))) {
        recover();
      }
    };

    window.addEventListener("error", handleWindowError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError, true);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
