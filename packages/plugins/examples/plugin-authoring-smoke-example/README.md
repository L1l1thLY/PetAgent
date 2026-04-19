# Plugin Authoring Smoke Example

A PetAgent plugin

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

## Install Into PetAgent

```bash
pnpm petagentai plugin install ./
```

## Build Options

- `pnpm build` uses esbuild presets from `@petagentai/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
