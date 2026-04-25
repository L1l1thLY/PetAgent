import fs from "node:fs";
import { promises as fsp } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { applyPendingMigrations, ensurePostgresDatabase } from "./client.js";

/**
 * Cross-process mutex for `embedded-postgres` `initialise()` + `start()`.
 * Without this, vitest's forks pool spins up a postgres per test file in
 * parallel and racing initdb invocations collide — error mentions a
 * non-existent "data directory might already exist" and is a known
 * M0 flake. The lock holds during init/start; once postgres is running
 * the lock releases so unrelated suites proceed in parallel.
 */
const POSTGRES_INIT_LOCK_PATH = path.join(os.tmpdir(), "petagent-embedded-postgres-init.lock");
const POSTGRES_INIT_LOCK_STALE_MS = 120_000;
const POSTGRES_INIT_LOCK_POLL_MS = 100;
const POSTGRES_INIT_LOCK_TIMEOUT_MS = 10 * 60_000;

export async function withEmbeddedPostgresInitLock<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const acquireStart = Date.now();
  while (true) {
    try {
      const handle = await fsp.open(POSTGRES_INIT_LOCK_PATH, "wx");
      try {
        await handle.write(`pid=${process.pid} label=${label} startedAt=${new Date().toISOString()}\n`);
      } catch {
        // best-effort identification only
      }
      try {
        return await fn();
      } finally {
        try {
          await handle.close();
        } catch {
          // ignore
        }
        try {
          await fsp.unlink(POSTGRES_INIT_LOCK_PATH);
        } catch {
          // already removed by another process — fine
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "EEXIST") throw err;
      try {
        const stat = await fsp.stat(POSTGRES_INIT_LOCK_PATH);
        const age = Date.now() - stat.mtimeMs;
        if (age > POSTGRES_INIT_LOCK_STALE_MS) {
          await fsp.unlink(POSTGRES_INIT_LOCK_PATH).catch(() => {});
          continue;
        }
      } catch {
        // lock disappeared between EEXIST and stat — retry the open immediately
        continue;
      }
      if (Date.now() - acquireStart > POSTGRES_INIT_LOCK_TIMEOUT_MS) {
        throw new Error(
          `embedded postgres init lock not acquirable within ${POSTGRES_INIT_LOCK_TIMEOUT_MS}ms (held by another test file?)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POSTGRES_INIT_LOCK_POLL_MS));
    }
  }
}

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  initdbFlags?: string[];
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

export type EmbeddedPostgresTestSupport = {
  supported: boolean;
  reason?: string;
};

export type EmbeddedPostgresTestDatabase = {
  connectionString: string;
  cleanup(): Promise<void>;
};

let embeddedPostgresSupportPromise: Promise<EmbeddedPostgresTestSupport> | null = null;

async function getEmbeddedPostgresCtor(): Promise<EmbeddedPostgresCtor> {
  const mod = await import("embedded-postgres");
  return mod.default as EmbeddedPostgresCtor;
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate test port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function formatEmbeddedPostgresError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return "embedded Postgres startup failed";
}

async function probeEmbeddedPostgresSupport(): Promise<EmbeddedPostgresTestSupport> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "petagent-embedded-postgres-probe-"));
  const port = await getAvailablePort();
  const EmbeddedPostgres = await getEmbeddedPostgresCtor();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "petagent",
    password: "petagent",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: () => {},
    onError: () => {},
  });

  try {
    await withEmbeddedPostgresInitLock("probe", async () => {
      await instance.initialise();
      await instance.start();
    });
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: formatEmbeddedPostgresError(error),
    };
  } finally {
    await instance.stop().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

export async function getEmbeddedPostgresTestSupport(): Promise<EmbeddedPostgresTestSupport> {
  if (!embeddedPostgresSupportPromise) {
    embeddedPostgresSupportPromise = probeEmbeddedPostgresSupport();
  }
  return await embeddedPostgresSupportPromise;
}

export async function startEmbeddedPostgresTestDatabase(
  tempDirPrefix: string,
): Promise<EmbeddedPostgresTestDatabase> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
  const port = await getAvailablePort();
  const EmbeddedPostgres = await getEmbeddedPostgresCtor();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "petagent",
    password: "petagent",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: () => {},
    onError: () => {},
  });

  try {
    await withEmbeddedPostgresInitLock(tempDirPrefix, async () => {
      await instance.initialise();
      await instance.start();
    });

    const adminConnectionString = `postgres://petagent:petagent@127.0.0.1:${port}/postgres`;
    await ensurePostgresDatabase(adminConnectionString, "petagent");
    const connectionString = `postgres://petagent:petagent@127.0.0.1:${port}/petagent`;
    await applyPendingMigrations(connectionString);

    return {
      connectionString,
      cleanup: async () => {
        await instance.stop().catch(() => {});
        fs.rmSync(dataDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await instance.stop().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(
      `Failed to start embedded PostgreSQL test database: ${formatEmbeddedPostgresError(error)}`,
    );
  }
}
