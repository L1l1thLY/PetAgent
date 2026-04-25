#!/usr/bin/env node
/**
 * Recreates the major-version + unversioned dylib symlinks that
 * `@embedded-postgres/darwin-arm64` (and friends) ship as part of their
 * tarball but that some pnpm extraction setups drop on disk. Without
 * these aliases, dyld fails to load the bundled postgres binaries:
 *
 *   dyld: Library not loaded: @loader_path/../lib/libicudata.77.dylib
 *   dyld: Library not loaded: @loader_path/../lib/libicui18n.dylib
 *
 * For each `lib<name>.<major>.<minor>[.patch].dylib`, we make sure both
 * `lib<name>.<major>.dylib` and `lib<name>.dylib` exist as symlinks
 * pointing at the canonical versioned file. The script is idempotent
 * and a no-op when the symlinks already exist.
 *
 * Wired as a root-level `postinstall` hook so a fresh `pnpm install`
 * leaves embedded-postgres bootable.
 */

import fs from "node:fs";
import path from "node:path";

const PNPM_VENDOR = path.resolve(
  process.env.npm_config_local_prefix ?? process.cwd(),
  "node_modules",
  ".pnpm",
);

if (!fs.existsSync(PNPM_VENDOR)) {
  process.exit(0);
}

const versionedPattern = /^(lib[\w+-]+)\.(\d+)(?:\.\d+)*\.dylib$/;
let totalLinked = 0;
let inspectedDirs = 0;

for (const entry of fs.readdirSync(PNPM_VENDOR)) {
  if (!entry.startsWith("@embedded-postgres+")) continue;
  const libDir = path.join(
    PNPM_VENDOR,
    entry,
    "node_modules",
    "@embedded-postgres",
    entry.split("@embedded-postgres+")[1].split("@")[0],
    "native",
    "lib",
  );
  if (!fs.existsSync(libDir)) continue;
  inspectedDirs += 1;
  for (const file of fs.readdirSync(libDir)) {
    const m = versionedPattern.exec(file);
    if (!m) continue;
    const [, base, major] = m;
    for (const candidate of [`${base}.${major}.dylib`, `${base}.dylib`]) {
      if (candidate === file) continue;
      const linkPath = path.join(libDir, candidate);
      try {
        fs.lstatSync(linkPath);
        continue;
      } catch {
        // not present — create it
      }
      try {
        fs.symlinkSync(file, linkPath);
        totalLinked += 1;
      } catch (err) {
        if (err && typeof err === "object" && err.code === "EEXIST") continue;
        throw err;
      }
    }
  }
}

if (process.env.PETAGENT_VERBOSE_POSTINSTALL === "1") {
  console.log(
    `[fix-embedded-postgres-symlinks] inspected ${inspectedDirs} embedded-postgres lib dir(s); created ${totalLinked} symlink(s).`,
  );
}
