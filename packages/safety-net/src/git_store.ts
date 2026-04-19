import { promises as fs } from "node:fs";
import * as path from "node:path";
import git from "isomorphic-git";

export interface GitStoreConfig {
  rootDir: string;
  defaultAuthor?: { name: string; email: string };
}

export interface WriteResult {
  sha: string;
  path: string;
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
