/**
 * Local type stubs for @mariozechner/pi-coding-agent.
 *
 * These are minimal stubs covering only the symbols actually used by pi-skill-reload.
 * They let you build with `tsc` without any npm dependencies.
 *
 * When pi installs this package, it runs `npm install` in the package directory,
 * which installs the real @mariozechner/pi-coding-agent — at that point the real
 * types take over and these stubs are shadowed by the actual node_modules.
 *
 * To update stubs when the API changes:
 *   - ExtensionAPI / SessionStartEvent / SessionShutdownEvent → dist/core/extensions/types.d.ts
 */

// ── Session event types ──────────────────────────────────────────────────────

type SessionStartEvent = {
  reason: "new" | "resume" | "fork" | "reload";
  cwd: string;
};

type SessionShutdownEvent = {
  reason: "exit" | "reload";
};

// ── ExtensionAPI ─────────────────────────────────────────────────────────────

interface ExtensionAPI {
  /** Reload all extensions and skills. */
  reload(): Promise<void>;
  on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
  on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
}

type ExtensionHandler<E, R = unknown> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;

interface ExtensionContext {
  cwd: string;
  hasUI: boolean;
  isIdle(): boolean;
  signal: AbortSignal | undefined;
}

// ── Module exports ────────────────────────────────────────────────────────────

export type { ExtensionAPI, ExtensionContext };
