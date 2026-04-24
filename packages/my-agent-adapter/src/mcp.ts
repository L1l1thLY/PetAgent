/**
 * Per-Role MCP integration (spec §3.8).
 *
 * A role template declares an `mcpServers: string[]` subset (shortnames) —
 * only those MCP servers are exposed to the agent's tool environment when
 * its session starts. The adapter's MCPManager owns per-session register
 * and unregister so one agent's MCP surface never leaks to another.
 *
 * This module ships the port + an in-memory implementation suitable for
 * unit tests and in-process composition. The concrete wiring to the
 * Paperclip MCP adapter registry — a server-side concern — is out of
 * scope here and lands with the live runtime wiring pass.
 */

export interface McpServerEntry {
  /** Stable shortname used in role template `mcpServers`. */
  readonly name: string;
  /** Human-facing label; falls back to `name`. */
  readonly label?: string;
  /** Free-form metadata; adapters may stash transport config here. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface McpServerRegistry {
  /** Return every server the host declares; the manager will intersect against the role subset. */
  availableServers(): Promise<ReadonlyArray<McpServerEntry>>;
}

export interface McpSessionBinding {
  readonly sessionId: string;
  readonly agentId: string;
  readonly role: string;
  readonly active: ReadonlyArray<McpServerEntry>;
}

export class McpSubsetError extends Error {
  readonly missing: string[];
  constructor(message: string, missing: string[]) {
    super(message);
    this.name = "McpSubsetError";
    this.missing = missing;
  }
}

export interface McpManagerOptions {
  /** If true (default), unknown shortnames in the role subset throw McpSubsetError. Set false for permissive mode. */
  strict?: boolean;
}

export class McpManager {
  private readonly bindings = new Map<string, McpSessionBinding>();
  private readonly strict: boolean;

  constructor(
    private readonly registry: McpServerRegistry,
    opts: McpManagerOptions = {},
  ) {
    this.strict = opts.strict ?? true;
  }

  /**
   * Start a session for an agent, intersecting the role-declared shortnames
   * with the host's registered MCP servers. Returns the binding that was
   * installed.
   */
  async startSession(input: {
    sessionId: string;
    agentId: string;
    role: string;
    declaredServers?: ReadonlyArray<string>;
  }): Promise<McpSessionBinding> {
    if (this.bindings.has(input.sessionId)) {
      throw new Error(`MCP session already active: ${input.sessionId}`);
    }
    const declared = input.declaredServers ?? [];
    const available = await this.registry.availableServers();
    const byName = new Map<string, McpServerEntry>();
    for (const entry of available) byName.set(entry.name, entry);

    const unique = Array.from(new Set(declared));
    const missing: string[] = [];
    const active: McpServerEntry[] = [];
    for (const name of unique) {
      const entry = byName.get(name);
      if (!entry) {
        missing.push(name);
        continue;
      }
      active.push(entry);
    }
    if (missing.length > 0 && this.strict) {
      throw new McpSubsetError(
        `Role declared MCP servers that are not registered on the host: ${missing.join(", ")}`,
        missing,
      );
    }
    const binding: McpSessionBinding = {
      sessionId: input.sessionId,
      agentId: input.agentId,
      role: input.role,
      active,
    };
    this.bindings.set(input.sessionId, binding);
    return binding;
  }

  /** Stop a previously-started session. No-op if the session was never started. */
  async stopSession(sessionId: string): Promise<void> {
    this.bindings.delete(sessionId);
  }

  /** Return the currently-active binding for a session, if any. */
  getBinding(sessionId: string): McpSessionBinding | undefined {
    return this.bindings.get(sessionId);
  }

  /** Return every active session's binding (testing / health surface). */
  listActive(): ReadonlyArray<McpSessionBinding> {
    return Array.from(this.bindings.values());
  }

  /** Return true if one particular MCP server is live for this session. */
  isServerActive(sessionId: string, serverName: string): boolean {
    const binding = this.bindings.get(sessionId);
    if (!binding) return false;
    return binding.active.some((s) => s.name === serverName);
  }
}

/**
 * Convenience registry backed by a frozen array of servers — useful for
 * tests and for in-process deployments without a live MCP catalog.
 */
export class StaticMcpServerRegistry implements McpServerRegistry {
  private readonly entries: ReadonlyArray<McpServerEntry>;
  constructor(entries: ReadonlyArray<McpServerEntry>) {
    this.entries = Object.freeze([...entries]);
  }
  async availableServers(): Promise<ReadonlyArray<McpServerEntry>> {
    return this.entries;
  }
}
