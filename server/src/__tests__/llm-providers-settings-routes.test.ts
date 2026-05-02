import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { llmProvidersSettingsRoutes } from "../routes/llm-providers-settings.js";

let tmp: string;
let configPath: string;
let envPath: string;
let originalCwd: string;
let originalConfigEnv: string | undefined;
let originalLlmConfigEnv: string | undefined;

interface FakeBoardActor {
  type: "board";
  source?: "local_implicit";
  isInstanceAdmin?: boolean;
}

function buildApp(actor: FakeBoardActor = { type: "board", source: "local_implicit" }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: FakeBoardActor }).actor = actor;
    next();
  });
  app.use(llmProvidersSettingsRoutes());
  app.use((err: Error & { status?: number; statusCode?: number; name?: string }, _req, res, _next) => {
    const status =
      err.status ?? err.statusCode ?? (err.name === "ZodError" ? 400 : 500);
    res.status(status).json({ error: err.message });
  });
  return app;
}

async function getJSON(app: express.Express, url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = app.request as unknown;
    void req;
    const server = app.listen(0, async () => {
      try {
        const addr = (server.address() as { port: number }).port;
        const res = await fetch(`http://127.0.0.1:${addr}${url}`);
        const body = await res.json();
        server.close();
        resolve({ status: res.status, body });
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}

async function postJSON(
  app: express.Express,
  url: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const addr = (server.address() as { port: number }).port;
        const res = await fetch(`http://127.0.0.1:${addr}${url}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        server.close();
        resolve({ status: res.status, body });
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "petagent-llm-settings-"));
  configPath = path.join(tmp, "petagent.config.yaml");
  envPath = path.join(tmp, ".env");
  originalCwd = process.cwd();
  process.chdir(tmp);
  originalConfigEnv = process.env.PETAGENT_CONFIG;
  originalLlmConfigEnv = process.env.PETAGENT_LLM_CONFIG;
  // PETAGENT_CONFIG points at a config.json under tmp so resolvePetAgentEnvPath()
  // returns <tmp>/.env (uses the SAME directory as the config.json path).
  process.env.PETAGENT_CONFIG = path.join(tmp, "config.json");
  process.env.PETAGENT_LLM_CONFIG = configPath;
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalConfigEnv === undefined) delete process.env.PETAGENT_CONFIG;
  else process.env.PETAGENT_CONFIG = originalConfigEnv;
  if (originalLlmConfigEnv === undefined) delete process.env.PETAGENT_LLM_CONFIG;
  else process.env.PETAGENT_LLM_CONFIG = originalLlmConfigEnv;
  rmSync(tmp, { recursive: true, force: true });
});

describe("GET /instance/settings/llm-providers", () => {
  it("returns the 8 v1 presets even when no config exists", async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, "/instance/settings/llm-providers");
    expect(status).toBe(200);
    const b = body as { presets: Array<{ id: string }>; configSource: string };
    expect(b.presets.map((p) => p.id).sort()).toEqual([
      "anthropic",
      "deepseek",
      "gemini",
      "kimi",
      "kimi-coding",
      "minimax",
      "minimax-cn",
      "openai",
      "zai",
    ]);
    expect(b.configSource).toBe("env-fallback");
  });

  it("returns providers + routing when config file exists", async () => {
    writeFileSync(
      configPath,
      `providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  psychologist: my-kimi
  reflector: my-kimi
  embedding: my-kimi
`,
      "utf-8",
    );
    const app = buildApp();
    const { body } = await getJSON(app, "/instance/settings/llm-providers");
    const b = body as {
      providers: Array<{ id: string; preset: string; apiKeyEnv: string; hasKey: boolean }>;
      routing: { psychologist: string };
      configSource: string;
    };
    expect(b.providers).toHaveLength(1);
    expect(b.providers[0].id).toBe("my-kimi");
    expect(b.providers[0].apiKeyEnv).toBe("KIMI_API_KEY");
    expect(b.providers[0].hasKey).toBe(false); // no env var set yet
    expect(b.routing.psychologist).toBe("my-kimi");
    expect(b.configSource).toBe("config");
  });

  it("hasKey reflects when key is in .env file (dotenv)", async () => {
    writeFileSync(
      configPath,
      `providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  psychologist: my-kimi
`,
      "utf-8",
    );
    writeFileSync(envPath, "KIMI_API_KEY=sk-moonshot-test\n", "utf-8");
    const app = buildApp();
    const { body } = await getJSON(app, "/instance/settings/llm-providers");
    const b = body as { providers: Array<{ id: string; hasKey: boolean }> };
    expect(b.providers[0].hasKey).toBe(true);
  });

  it("never returns the actual key value (only hasKey boolean)", async () => {
    writeFileSync(
      configPath,
      `providers:
  - id: x
    preset: kimi
    api_key_env: KIMI_API_KEY
`,
      "utf-8",
    );
    writeFileSync(envPath, "KIMI_API_KEY=sk-secret-token-shhhh\n", "utf-8");
    const app = buildApp();
    const { body } = await getJSON(app, "/instance/settings/llm-providers");
    expect(JSON.stringify(body)).not.toContain("sk-secret-token-shhhh");
  });
});

describe("POST /instance/settings/llm-providers", () => {
  it("writes yaml + env file with a single Kimi provider routed to all 3 subsystems", async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [
        { id: "my-kimi", preset: "kimi", apiKey: "sk-moonshot-real-key" },
      ],
      routing: {
        psychologist: "my-kimi",
        reflector: "my-kimi",
        embedding: "my-kimi",
      },
    });
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    const writtenYaml = yaml.load(readFileSync(configPath, "utf-8")) as {
      providers: Array<{ id: string; preset: string; api_key_env: string }>;
      llm_routing: { psychologist: string };
    };
    expect(writtenYaml.providers).toHaveLength(1);
    expect(writtenYaml.providers[0].api_key_env).toBe("KIMI_API_KEY");
    expect(writtenYaml.llm_routing.psychologist).toBe("my-kimi");

    const env = readFileSync(envPath, "utf-8");
    expect(env).toContain("KIMI_API_KEY=sk-moonshot-real-key");
  });

  it("does NOT overwrite key when apiKey omitted on update", async () => {
    writeFileSync(envPath, "KIMI_API_KEY=existing-key\n", "utf-8");
    const app = buildApp();
    await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "my-kimi", preset: "kimi" }],
      routing: { psychologist: "my-kimi" },
    });
    const env = readFileSync(envPath, "utf-8");
    expect(env).toContain("KIMI_API_KEY=existing-key");
  });

  it("preserves unrelated env vars (round-trip)", async () => {
    writeFileSync(
      envPath,
      `# my comment\nFOO=bar\nDATABASE_URL=postgres://localhost/db\n`,
      "utf-8",
    );
    const app = buildApp();
    await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "x", preset: "kimi", apiKey: "new-key" }],
      routing: { psychologist: "x" },
    });
    const env = readFileSync(envPath, "utf-8");
    expect(env).toContain("# my comment");
    expect(env).toContain("FOO=bar");
    expect(env).toContain("DATABASE_URL=postgres://localhost/db");
    expect(env).toContain("KIMI_API_KEY=new-key");
  });

  it("rejects unknown preset", async () => {
    const app = buildApp();
    const { status } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "x", preset: "ghost", apiKey: "k" }],
      routing: {},
    });
    expect(status).toBe(400);
  });

  it("rejects non-instance-admin caller", async () => {
    const app = buildApp({ type: "board", isInstanceAdmin: false });
    const { status } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [],
      routing: {},
    });
    expect(status).toBe(403);
  });

  it("rejects routing target that doesn't reference a declared provider", async () => {
    const app = buildApp();
    const { status } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "real", preset: "kimi", apiKey: "k" }],
      routing: { psychologist: "ghost" },
    });
    expect(status).toBe(400);
  });

  it("rejects anthropic provider as embedding target (preset doesn't speak openai_embeddings)", async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "ant", preset: "anthropic", apiKey: "sk-ant" }],
      routing: { embedding: "ant" },
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(/openai_embeddings/);
  });

  it("supports multiple providers with same preset (env name auto-disambiguates)", async () => {
    const app = buildApp();
    await postJSON(app, "/instance/settings/llm-providers", {
      providers: [
        { id: "kimi-prod", preset: "kimi", apiKey: "k1" },
        { id: "kimi-test", preset: "kimi", apiKey: "k2" },
      ],
      routing: { psychologist: "kimi-prod", reflector: "kimi-test" },
    });
    const env = readFileSync(envPath, "utf-8");
    expect(env).toContain("KIMI_API_KEY=k1");
    expect(env).toContain("KIMI_API_KEY_2=k2");
  });

  it("returns the env keys it wrote (telemetry)", async () => {
    const app = buildApp();
    const { body } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "x", preset: "kimi", apiKey: "k" }],
      routing: { psychologist: "x" },
    });
    expect((body as { wroteEnvKeys: string[] }).wroteEnvKeys).toEqual(["KIMI_API_KEY"]);
  });

  it("flags restartRequired in the response", async () => {
    const app = buildApp();
    const { body } = await postJSON(app, "/instance/settings/llm-providers", {
      providers: [{ id: "x", preset: "kimi", apiKey: "k" }],
      routing: { psychologist: "x" },
    });
    expect((body as { restartRequired: boolean }).restartRequired).toBe(true);
  });
});
