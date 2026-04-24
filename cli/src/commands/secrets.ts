import * as path from "node:path";
import * as os from "node:os";
import type { Command } from "commander";
import {
  EncryptedFileSecretsStore,
  PreferredSecretsStore,
  tryCreateKeychainStore,
  assertValidSecretName,
  type SecretsStore,
} from "@petagent/secrets";

export interface SecretsCliOptions {
  config?: string;
  dataDir?: string;
  keyFile?: string;
  storeFile?: string;
  serviceName?: string;
  noKeychain?: boolean;
}

export interface SecretsStoreResolution {
  store: SecretsStore;
  primaryKind: "keychain" | "encrypted_file";
  fallbackKind: "encrypted_file" | null;
}

function defaultKeyFilePath(dataDir: string | undefined): string {
  const base = dataDir?.trim() || path.join(os.homedir(), ".petagent", "instances", "default");
  return path.join(base, "secrets", "master.key");
}

function defaultStoreFilePath(dataDir: string | undefined): string {
  const base = dataDir?.trim() || path.join(os.homedir(), ".petagent", "instances", "default");
  return path.join(base, "secrets", "store.json");
}

/**
 * Resolve the store from CLI options. When keytar is importable and the
 * user didn't pass `--no-keychain`, use a PreferredSecretsStore wrapping
 * keychain first + encrypted file fallback. Otherwise return the
 * encrypted file store by itself.
 */
export async function resolveSecretsStore(
  opts: SecretsCliOptions,
): Promise<SecretsStoreResolution> {
  const keyFile = opts.keyFile ?? defaultKeyFilePath(opts.dataDir);
  const storeFile = opts.storeFile ?? defaultStoreFilePath(opts.dataDir);
  const fileStore = new EncryptedFileSecretsStore({
    storePath: storeFile,
    keyFilePath: keyFile,
  });
  if (opts.noKeychain) {
    return { store: fileStore, primaryKind: "encrypted_file", fallbackKind: null };
  }
  const keychain = await tryCreateKeychainStore({ serviceName: opts.serviceName });
  if (!keychain) {
    return { store: fileStore, primaryKind: "encrypted_file", fallbackKind: null };
  }
  const preferred = new PreferredSecretsStore(keychain, fileStore);
  return {
    store: preferred,
    primaryKind: "keychain",
    fallbackKind: "encrypted_file",
  };
}

async function readStdinValue(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(
      "No value supplied on stdin. Pipe the secret in, e.g. `printf '%s' $TOKEN | petagent secrets set <name>`.",
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function registerSecretsCommand(program: Command): void {
  const secrets = program
    .command("secrets")
    .description("Manage encrypted PetAgent secrets (system keychain + encrypted-file fallback).");

  function addCommonOptions(cmd: Command): Command {
    return cmd
      .option("-c, --config <path>", "Path to PetAgent config file")
      .option("-d, --data-dir <path>", "PetAgent data directory root (isolates state from ~/.petagent)")
      .option("--key-file <path>", "Master-key file (defaults to <data-dir>/secrets/master.key)")
      .option("--store-file <path>", "Encrypted-file store path (defaults to <data-dir>/secrets/store.json)")
      .option("--service-name <name>", "Keychain service name", "petagent")
      .option("--no-keychain", "Bypass the system keychain and use only the encrypted file store");
  }

  addCommonOptions(
    secrets
      .command("set <name>")
      .description("Store (or replace) a secret. Reads the value from stdin — never on the argv.")
      .action(async (name: string, opts: SecretsCliOptions) => {
        try {
          assertValidSecretName(name);
          const value = await readStdinValue();
          const { store, primaryKind } = await resolveSecretsStore(opts);
          await store.set(name, value.replace(/\n$/, ""));
          console.log(`secret "${name}" stored in ${primaryKind}`);
        } catch (err) {
          handleError(err);
        }
      }),
  );

  addCommonOptions(
    secrets
      .command("get <name>")
      .description("Print the stored secret value to stdout. Exit 1 if absent.")
      .action(async (name: string, opts: SecretsCliOptions) => {
        try {
          assertValidSecretName(name);
          const { store } = await resolveSecretsStore(opts);
          const value = await store.get(name);
          if (value === null) {
            console.error(`secret "${name}" not found`);
            process.exit(1);
          }
          process.stdout.write(value);
          if (!value.endsWith("\n")) process.stdout.write("\n");
        } catch (err) {
          handleError(err);
        }
      }),
  );

  addCommonOptions(
    secrets
      .command("delete <name>")
      .alias("rm")
      .description("Remove a secret. Exit 1 if nothing was removed.")
      .action(async (name: string, opts: SecretsCliOptions) => {
        try {
          assertValidSecretName(name);
          const { store } = await resolveSecretsStore(opts);
          const removed = await store.delete(name);
          if (!removed) {
            console.error(`secret "${name}" not found`);
            process.exit(1);
          }
          console.log(`secret "${name}" deleted`);
        } catch (err) {
          handleError(err);
        }
      }),
  );

  addCommonOptions(
    secrets
      .command("list")
      .alias("ls")
      .description("Enumerate stored secret names. Values are NEVER printed.")
      .action(async (opts: SecretsCliOptions) => {
        try {
          const { store, primaryKind, fallbackKind } = await resolveSecretsStore(opts);
          const names = await store.listNames();
          if (names.length === 0) {
            console.log(`(no secrets — ${describeSources(primaryKind, fallbackKind)})`);
            return;
          }
          console.log(`source: ${describeSources(primaryKind, fallbackKind)}`);
          for (const name of names) console.log(name);
        } catch (err) {
          handleError(err);
        }
      }),
  );

  addCommonOptions(
    secrets
      .command("rotate <name>")
      .description("Replace an existing secret's value. Reads the new value from stdin.")
      .action(async (name: string, opts: SecretsCliOptions) => {
        try {
          assertValidSecretName(name);
          const { store, primaryKind } = await resolveSecretsStore(opts);
          const existing = await store.get(name);
          if (existing === null) {
            console.error(`secret "${name}" not found — use \`secrets set\` to create it`);
            process.exit(1);
          }
          const value = await readStdinValue();
          await store.set(name, value.replace(/\n$/, ""));
          console.log(`secret "${name}" rotated in ${primaryKind}`);
        } catch (err) {
          handleError(err);
        }
      }),
  );
}

export function describeSources(
  primaryKind: "keychain" | "encrypted_file",
  fallbackKind: "encrypted_file" | null,
): string {
  if (primaryKind === "keychain" && fallbackKind === "encrypted_file") {
    return "system keychain (primary) + encrypted file (fallback)";
  }
  if (primaryKind === "encrypted_file") return "encrypted file store";
  return primaryKind;
}

function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
