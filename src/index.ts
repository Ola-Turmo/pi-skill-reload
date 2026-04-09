/**
 * pi-skill-reload
 *
 * Watches skill SKILL.md files and triggers a hot-reload when they change.
 * No tools, no UI — just a background file watcher that keeps skills fresh
 * without requiring /new or a session restart.
 */

import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { join } from "node:path";

/** Recursively find all SKILL.md files under a directory. */
function findSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          const skillMd = join(full, "SKILL.md");
          // Always recurse — a directory may have both a SKILL.md AND sub-skills
          if (existsSync(skillMd)) results.push(skillMd);
          results.push(...findSkillFiles(full));
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Directory unreadable
  }
  return results;
}

/** Standard pi skill directory patterns. */
const SKILL_DIR_PATTERNS = [
  "~/.pi/agent/skills",
  "~/.agents/skills",
  ".pi/skills",
  ".agents/skills",
];

/** Expand ~ and relative paths to absolute given a cwd. */
function resolveSkillDirs(cwd: string): string[] {
  const home = process.env.HOME ?? "/root";
  return SKILL_DIR_PATTERNS.map((d) => {
    const expanded = d.replace(/^~\//, `${home}/`);
    return expanded.startsWith("/") ? expanded : join(cwd, expanded);
  });
}

/** Collect all SKILL.md files from standard pi skill directories. */
function collectSkillFiles(cwd: string): string[] {
  const dirs = resolveSkillDirs(cwd);
  const files: string[] = [];
  for (const dir of dirs) {
    files.push(...findSkillFiles(dir));
  }
  return [...new Set(files)];
}

type Pi = import("@mariozechner/pi-coding-agent").ExtensionAPI;

export default async function (pi: Pi) {
  let cwd = process.cwd();
  let isFirstScan = true;
  const watchers = new Map<string, ReturnType<typeof watch>>();

  function closeAllWatchers() {
    for (const w of watchers.values()) {
      try { w.close(); } catch { /* ignore */ }
    }
    watchers.clear();
  }

  /**
   * Trigger pi's internal reload handler.
   * `pi.reload()` is on the ExtensionRunner at runtime even though the
   * ExtensionAPI type doesn't expose it. We safely invoke it via cast.
   */
  async function doReload() {
    await (pi as any).reload?.();
  }

  /**
   * Scan skill dirs, update watchers, and trigger reload if anything changed.
   * On first scan: reload so newly installed skills register immediately.
   * On subsequent scans: only reload when a file actually changes.
   */
  async function scanAndWatch() {
    const files = collectSkillFiles(cwd);
    const currentPaths = new Set(files);

    // Remove watchers for skills that no longer exist
    for (const [path, w] of watchers) {
      if (!currentPaths.has(path)) {
        try { w.close(); } catch { /* ignore */ }
        watchers.delete(path);
      }
    }

    // Add watchers for new skills
    for (const file of files) {
      if (!watchers.has(file)) {
        try {
          const w = watch(file, (eventType) => {
            // Respond to both 'change' (content edit) and 'rename' (file replace)
            if (eventType === "change" || eventType === "rename") {
              doReload();
            }
          });
          watchers.set(file, w);
        } catch {
          // Can't watch this file (permissions, etc.)
        }
      }
    }

    // On first scan, trigger reload so newly installed skills load immediately
    if (isFirstScan && watchers.size > 0) {
      isFirstScan = false;
      await doReload();
    }
  }

  // Re-scan on session start
  pi.on("session_start", async (event) => {
    if (event.reason === "reload") {
      // Reload was triggered manually — re-scan after extensions reload
      closeAllWatchers();
      isFirstScan = true;
      await scanAndWatch();
      return;
    }
    // For new/resume/fork sessions, re-scan in case cwd changed
    closeAllWatchers();
    isFirstScan = false;
    await scanAndWatch();
  });

  // Clean up on shutdown
  pi.on("session_shutdown", () => {
    closeAllWatchers();
  });

  // Initial scan
  await scanAndWatch();
}
