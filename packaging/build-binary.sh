#!/usr/bin/env bash
# Build a single-file PetAgent CLI binary using @vercel/ncc.
#
# M0 scope: produce one binary for the current platform. The release workflow
# runs this inside a matrix to cover darwin-arm64 / darwin-x64 / linux-x64 /
# windows-x64. Output lands in dist/binaries/petagent-<platform>-<arch>[.exe].
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PLATFORM="$(node -p 'process.platform')"
ARCH="$(node -p 'process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch')"
SUFFIX=""
if [[ "$PLATFORM" == "win32" ]]; then
  SUFFIX=".exe"
fi

OUT_DIR="$ROOT/dist/binaries"
OUT_BIN="$OUT_DIR/petagent-${PLATFORM}-${ARCH}${SUFFIX}"

mkdir -p "$OUT_DIR"

echo ">> Building @petagent/cli with ncc"
pnpm --filter @petagent/cli exec -- npx --yes @vercel/ncc@0.38.1 build src/index.ts -o dist/ncc -m

BUNDLE="$ROOT/cli/dist/ncc/index.js"
if [[ ! -f "$BUNDLE" ]]; then
  echo "ERROR: expected bundle at $BUNDLE" >&2
  exit 1
fi

echo ">> Writing single-file binary to $OUT_BIN"
# Node 20+ single executable application (SEA) flow.
# Keep the copy approach simple: prepend a shebang and make executable.
{
  printf '#!/usr/bin/env node\n'
  cat "$BUNDLE"
} > "$OUT_BIN"
chmod +x "$OUT_BIN"

echo ">> Sanity check"
"$OUT_BIN" --version

echo ">> Done: $OUT_BIN"
