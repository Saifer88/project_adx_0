/**
 * Repo-root + scope-location resolution for stable, machine-independent
 * `scopeId` location strings.
 *
 * `scopeId(name, locationPath)` hashes `name\u0000locationPath` VERBATIM — it
 * performs no normalization — so the caller MUST pass a stable, repo-relative,
 * POSIX-normalized path for composed/page children. These helpers compute that
 * path so an absolute prefix (a user's home dir) never enters the hash and the
 * id is identical across checkouts/machines.
 *
 * The single-component M1 path keeps `basename(dir)` and does NOT use these.
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

/**
 * The nearest ancestor directory of `inputPath` (walking up) that contains a
 * `package.json`. If none is found before the filesystem root, fall back to the
 * input's own directory. Deterministic, no git required.
 *
 * @param inputPath a file OR directory inside the build (component dir, or a
 *   page manifest's directory).
 */
export function repoRoot(inputPath: string): string {
  const abs = resolve(inputPath);
  // Start from the input's directory when it is a file-like leaf; when it is a
  // directory the caller should pass the directory itself.
  let current = abs;
  const root = parse(abs).root;
  // Walk up until a package.json is found or we hit the filesystem root.
  // The first iteration tests `current` itself.
  for (;;) {
    if (existsSync(join(current, "package.json"))) {
      return current;
    }
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return abs;
}

/**
 * The stable `scopeId` location string for an absolute component directory:
 * `relative(repoRoot, absDir)` with path separators normalized to `/`.
 */
export function scopeLocation(root: string, absDir: string): string {
  const rel = relative(root, absDir);
  const posix = rel.split(/[\\/]+/).join("/");
  // When the component dir IS the repo root (edge), relative() returns "" —
  // fall back to an absolute POSIX path so the hash stays non-empty.
  if (posix.length === 0) {
    return (isAbsolute(absDir) ? absDir : resolve(absDir))
      .split(/[\\/]+/)
      .join("/");
  }
  return posix;
}
