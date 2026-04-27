import { promises as fs } from "node:fs";
import * as path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

export interface GitStoreConfig {
  rootDir: string;
  defaultAuthor?: { name: string; email: string };
}

export interface WriteResult {
  sha: string;
  path: string;
}

export interface PushAuth {
  /** Token used as both username + password for HTTPS basic auth.
   *  GitHub: a personal-access-token; GitLab: a deploy-token; etc. */
  token?: string;
  /** Explicit username/password if your remote needs them split. */
  username?: string;
  password?: string;
}

export interface PushResult {
  remote: string;
  ref: string;
  ok: boolean;
  pushedHeadSha: string | null;
  /** Set when ok=false. */
  error?: string;
}

/**
 * Git-backed content store. Files live on-disk under `rootDir`; every write
 * is an isomorphic-git commit so we get history, blame, and easy rollback
 * without needing a real git binary on the host.
 *
 * M1 scope: minimal surface — init, writeFile (with per-write commit),
 * readFile, listFiles, history. Branch/merge land when Self-Evolution (M2)
 * needs them.
 */
export class GitStore {
  private readonly rootDir: string;
  private readonly author: { name: string; email: string };

  constructor(config: GitStoreConfig) {
    this.rootDir = config.rootDir;
    this.author = config.defaultAuthor ?? {
      name: "PetAgent",
      email: "petagent@local",
    };
  }

  async init(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const gitDir = path.join(this.rootDir, ".git");
    try {
      await fs.access(gitDir);
      return;
    } catch {
      // not initialised yet
    }
    await git.init({ fs, dir: this.rootDir, defaultBranch: "main" });
  }

  async writeFile(relPath: string, content: string, message: string): Promise<WriteResult> {
    const abs = path.join(this.rootDir, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    await git.add({ fs, dir: this.rootDir, filepath: relPath });
    const sha = await git.commit({
      fs,
      dir: this.rootDir,
      message,
      author: this.author,
    });
    return { sha, path: relPath };
  }

  async readFile(relPath: string): Promise<string> {
    const abs = path.join(this.rootDir, relPath);
    return fs.readFile(abs, "utf8");
  }

  async listFiles(prefix = ""): Promise<string[]> {
    const files = await git.listFiles({ fs, dir: this.rootDir });
    return prefix ? files.filter((f) => f.startsWith(prefix)) : files;
  }

  /**
   * Idempotently configure a remote URL. Safe to call on every boot —
   * if the remote name already exists with the same URL, this is a
   * no-op; if URL differs, it overwrites.
   */
  async setRemote(name: string, url: string): Promise<void> {
    try {
      const existing = await git.getConfig({
        fs,
        dir: this.rootDir,
        path: `remote.${name}.url`,
      });
      if (existing === url) return;
    } catch {
      // No existing config, fall through to set.
    }
    await git.setConfig({
      fs,
      dir: this.rootDir,
      path: `remote.${name}.url`,
      value: url,
    });
  }

  async getRemote(name: string): Promise<string | null> {
    try {
      const url = await git.getConfig({
        fs,
        dir: this.rootDir,
        path: `remote.${name}.url`,
      });
      return typeof url === "string" && url.length > 0 ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Push HEAD of `ref` (default "main") to remote `remoteName` (default "origin").
   * Never throws — wraps failures into PushResult.error so callers
   * (typically a setInterval routine) can keep running.
   *
   * Auth: token-only is the simplest path (GitHub/GitLab PATs).
   * isomorphic-git's onAuth callback is invoked once per push.
   */
  async push(opts: {
    remoteName?: string;
    ref?: string;
    auth?: PushAuth;
    force?: boolean;
  } = {}): Promise<PushResult> {
    const remoteName = opts.remoteName ?? "origin";
    const ref = opts.ref ?? "main";
    const remoteUrl = await this.getRemote(remoteName);
    if (remoteUrl === null) {
      return {
        remote: remoteName,
        ref,
        ok: false,
        pushedHeadSha: null,
        error: `remote "${remoteName}" is not configured`,
      };
    }
    let head: string | null = null;
    try {
      head = await git.resolveRef({ fs, dir: this.rootDir, ref });
    } catch {
      return {
        remote: remoteName,
        ref,
        ok: false,
        pushedHeadSha: null,
        error: `ref "${ref}" not found locally`,
      };
    }
    try {
      await git.push({
        fs,
        http,
        dir: this.rootDir,
        remote: remoteName,
        ref,
        force: opts.force ?? false,
        onAuth: () => buildAuthShape(opts.auth),
      });
      return { remote: remoteName, ref, ok: true, pushedHeadSha: head };
    } catch (err) {
      return {
        remote: remoteName,
        ref,
        ok: false,
        pushedHeadSha: head,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async history(relPath: string, depth = 50): Promise<Array<{ sha: string; message: string; timestamp: number }>> {
    const commits = await git.log({
      fs,
      dir: this.rootDir,
      filepath: relPath,
      depth,
    });
    return commits.map((c) => ({
      sha: c.oid,
      message: c.commit.message.trim(),
      timestamp: c.commit.committer.timestamp,
    }));
  }
}

function buildAuthShape(auth: PushAuth | undefined): { username: string; password: string } | undefined {
  if (auth === undefined) return undefined;
  if (auth.username !== undefined && auth.password !== undefined) {
    return { username: auth.username, password: auth.password };
  }
  if (auth.token !== undefined) {
    // Most providers accept token in either field; GitHub specifically
    // wants username="x-access-token" with PAT in password.
    return { username: "x-access-token", password: auth.token };
  }
  return undefined;
}
