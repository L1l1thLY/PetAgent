import { spawn } from "node:child_process";

export const DEFAULT_UI_URL = "http://localhost:3000/board";

export interface OpenOptions {
  url?: string;
}

export interface OpenDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  spawn?: typeof spawn;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export function resolveOpenCommand(platform: NodeJS.Platform): {
  command: string;
  baseArgs: readonly string[];
} {
  if (platform === "darwin") return { command: "open", baseArgs: [] };
  if (platform === "win32") return { command: "cmd", baseArgs: ["/c", "start", ""] };
  return { command: "xdg-open", baseArgs: [] };
}

export async function openBoard(options: OpenOptions, deps: OpenDeps = {}): Promise<number> {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const spawnFn = deps.spawn ?? spawn;
  const stdout = deps.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr = deps.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  const url = options.url ?? env.PETAGENT_UI_URL ?? DEFAULT_UI_URL;
  const { command, baseArgs } = resolveOpenCommand(platform);
  const args = [...baseArgs, url];

  stdout(`Opening ${url}`);

  return new Promise<number>((resolve) => {
    const child = spawnFn(command, args, { stdio: "ignore", detached: true });
    let settled = false;
    const settle = (code: number) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.on("error", (error: Error) => {
      stderr(`Failed to launch ${command}: ${error.message}`);
      stderr(`Hint: run \`petagent serve\` first, or set PETAGENT_UI_URL.`);
      settle(1);
    });
    child.on("spawn", () => {
      child.unref();
      settle(0);
    });
  });
}
