import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, KeyRound, AlertCircle, RotateCw, CheckCircle2 } from "lucide-react";
import {
  llmProvidersApi,
  type LlmProvidersConfig,
  type PresetMeta,
  type ProviderUpdateInput,
} from "@/api/llmProviders";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface DraftProvider {
  /** Stable React key. */
  key: string;
  /** Server id (slug). Empty for new providers until user types one. */
  id: string;
  preset: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  /** True when entry came from server; false for newly added. */
  existing: boolean;
  /** Server reported a key resolved from env. Show "set" badge. */
  hasExistingKey: boolean;
  apiKeyEnv: string | null;
}

interface DraftRouting {
  psychologist: string;
  reflector: string;
  embedding: string;
}

function makeDraftKey() {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function InstanceLlmProvidersSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "LLM Providers" },
    ]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: queryKeys.instance.llmProviders,
    queryFn: () => llmProvidersApi.get(),
  });

  if (query.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (query.error) {
    return (
      <div className="p-6 text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Failed to load"}
      </div>
    );
  }
  if (!query.data) return null;

  return (
    <Editor
      data={query.data}
      onSaved={() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.llmProviders })
      }
    />
  );
}

function Editor({
  data,
  onSaved,
}: {
  data: LlmProvidersConfig;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftProvider[]>(() =>
    data.providers.map((p) => ({
      key: makeDraftKey(),
      id: p.id,
      preset: p.preset,
      model: p.model ?? "",
      baseUrl: p.baseUrl ?? "",
      apiKey: "",
      existing: true,
      hasExistingKey: p.hasKey,
      apiKeyEnv: p.apiKeyEnv,
    })),
  );
  const [routing, setRouting] = useState<DraftRouting>({
    psychologist: data.routing.psychologist ?? "",
    reflector: data.routing.reflector ?? "",
    embedding: data.routing.embedding ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ wroteKeys: string[] } | null>(null);

  const presets = data.presets;
  const presetById = useMemo(() => {
    const m = new Map<string, PresetMeta>();
    for (const p of presets) m.set(p.id, p);
    return m;
  }, [presets]);

  const mutation = useMutation({
    mutationFn: (payload: { providers: ProviderUpdateInput[]; routing: DraftRouting }) =>
      llmProvidersApi.update({
        providers: payload.providers,
        routing: {
          ...(payload.routing.psychologist
            ? { psychologist: payload.routing.psychologist }
            : {}),
          ...(payload.routing.reflector ? { reflector: payload.routing.reflector } : {}),
          ...(payload.routing.embedding ? { embedding: payload.routing.embedding } : {}),
        },
      }),
    onSuccess: (res) => {
      setError(null);
      setSaved({ wroteKeys: res.wroteEnvKeys });
      onSaved();
      // Clear typed-in apiKey values now that they've been written; keep
      // hasExistingKey true so the user sees "set".
      setDrafts((prev) =>
        prev.map((d) => ({
          ...d,
          apiKey: "",
          hasExistingKey: d.hasExistingKey || d.apiKey.length > 0,
        })),
      );
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaved(null);
    },
  });

  function addProvider(presetId: string = "kimi") {
    const preset = presetById.get(presetId);
    setDrafts((prev) => [
      ...prev,
      {
        key: makeDraftKey(),
        id: suggestProviderId(presetId, prev),
        preset: presetId,
        model: "",
        baseUrl: "",
        apiKey: "",
        existing: false,
        hasExistingKey: false,
        apiKeyEnv: preset?.apiKeyEnvVars[0] ?? null,
      },
    ]);
  }

  function removeProvider(key: string) {
    setDrafts((prev) => {
      const removed = prev.find((d) => d.key === key);
      if (removed) {
        setRouting((r) => ({
          psychologist: r.psychologist === removed.id ? "" : r.psychologist,
          reflector: r.reflector === removed.id ? "" : r.reflector,
          embedding: r.embedding === removed.id ? "" : r.embedding,
        }));
      }
      return prev.filter((d) => d.key !== key);
    });
  }

  function updateDraft(key: string, patch: Partial<DraftProvider>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  const idClashIds = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const d of drafts) {
      if (d.id === "") continue;
      if (seen.has(d.id)) dup.add(d.id);
      seen.add(d.id);
    }
    return dup;
  }, [drafts]);

  const declaredIds = drafts.map((d) => d.id).filter((id) => id !== "");

  function handleSave() {
    setSaved(null);
    setError(null);
    if (drafts.some((d) => d.id === "")) {
      setError("Every provider needs an id (lowercase letters / digits / dashes).");
      return;
    }
    if (idClashIds.size > 0) {
      setError(`Duplicate provider id: ${Array.from(idClashIds).join(", ")}`);
      return;
    }
    for (const d of drafts) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(d.id)) {
        setError(`Invalid id "${d.id}": use lowercase letters, digits, dashes only`);
        return;
      }
      if (!d.existing && d.apiKey.trim().length === 0) {
        setError(`Provider "${d.id}" needs an API key.`);
        return;
      }
    }

    const payload: ProviderUpdateInput[] = drafts.map((d) => ({
      id: d.id,
      preset: d.preset,
      ...(d.model.trim() ? { model: d.model.trim() } : {}),
      ...(d.baseUrl.trim() ? { baseUrl: d.baseUrl.trim() } : {}),
      ...(d.apiKey.trim() ? { apiKey: d.apiKey.trim() } : {}),
    }));
    mutation.mutate({ providers: payload, routing });
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> LLM Providers
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure which AI provider runs your Psychologist, Reflector, and Embedding subsystems.
          Keys are stored in <code className="text-xs">{data.envPath}</code> (chmod 600).
          Routing config lives at <code className="text-xs">{data.configPath}</code>.
        </p>
        <p className="text-xs text-muted-foreground">
          Source: <span className="font-mono">{data.configSource}</span>
          {data.configSource === "env-fallback" && (
            <> — saving here will create the YAML file and switch to <span className="font-mono">config</span> mode.</>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>
            Each provider is one API account. You can declare the same preset twice (e.g. prod + test
            Kimi keys) — the env var name auto-disambiguates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {drafts.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              No providers configured yet. Click "Add provider" below.
            </div>
          ) : (
            drafts.map((d) => (
              <ProviderCard
                key={d.key}
                draft={d}
                presets={presets}
                onChange={(patch) => updateDraft(d.key, patch)}
                onRemove={() => removeProvider(d.key)}
                isClashing={idClashIds.has(d.id)}
              />
            ))
          )}
          <div>
            <Button variant="outline" onClick={() => addProvider()}>
              <Plus className="h-4 w-4 mr-1" /> Add provider
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
          <CardDescription>
            Pick which provider each subsystem uses. Embedding only accepts providers whose preset
            speaks <code className="text-xs">openai_embeddings</code> (anthropic-only providers
            cannot embed).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RoutingRow
            label="Psychologist"
            description="Emotion classifier. Falls back to behavior-only when unset."
            value={routing.psychologist}
            providers={drafts}
            presetById={presetById}
            requireProtocol="chat"
            onChange={(v) => setRouting((r) => ({ ...r, psychologist: v }))}
          />
          <RoutingRow
            label="Reflector"
            description="Reflection note builder. Falls back to templated reflections when unset."
            value={routing.reflector}
            providers={drafts}
            presetById={presetById}
            requireProtocol="chat"
            onChange={(v) => setRouting((r) => ({ ...r, reflector: v }))}
          />
          <RoutingRow
            label="Embedding"
            description="Notes semantic search. Falls back to SHA-256 stub (keyword-only) when unset."
            value={routing.embedding}
            providers={drafts}
            presetById={presetById}
            requireProtocol="embedding"
            onChange={(v) => setRouting((r) => ({ ...r, embedding: v }))}
          />
        </CardContent>
      </Card>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 text-destructive p-3 rounded text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {saved && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Saved
            </CardTitle>
            <CardDescription>
              {saved.wroteKeys.length > 0 ? (
                <>
                  Wrote env vars: <span className="font-mono text-xs">{saved.wroteKeys.join(", ")}</span>.{" "}
                </>
              ) : (
                <>No new keys to write. </>
              )}
              <strong>Restart the server</strong> for changes to take effect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>If you started PetAgent via <code>pnpm dev:server</code> (watch mode),
                changes are picked up automatically — the server reloads when files change.</div>
              <div>Otherwise: <kbd className="px-1 py-0.5 rounded bg-muted text-xs">Ctrl+C</kbd> in
                the terminal, then re-run your start command.</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? <RotateCw className="h-4 w-4 mr-1 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function ProviderCard({
  draft,
  presets,
  onChange,
  onRemove,
  isClashing,
}: {
  draft: DraftProvider;
  presets: PresetMeta[];
  onChange: (patch: Partial<DraftProvider>) => void;
  onRemove: () => void;
  isClashing: boolean;
}) {
  const preset = presets.find((p) => p.id === draft.preset);
  const defaultModel = preset
    ? preset.defaultModels.openai_chat ??
      preset.defaultModels.anthropic_messages ??
      preset.defaultModels.openai_embeddings ??
      ""
    : "";
  const defaultEnvVar = preset?.apiKeyEnvVars[0] ?? "ANY_API_KEY";

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Provider id</Label>
            <Input
              value={draft.id}
              onChange={(e) => onChange({ id: slugify(e.target.value) })}
              placeholder="my-kimi"
              className={isClashing ? "border-destructive" : ""}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preset</Label>
            <Select value={draft.preset} onValueChange={(v) => onChange({ preset: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove ${draft.id || "provider"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-2">
          API key
          {draft.hasExistingKey && draft.apiKey === "" && (
            <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400">
              set
            </span>
          )}
        </Label>
        <Input
          type="password"
          value={draft.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder={
            draft.hasExistingKey
              ? `Stored in env var ${draft.apiKeyEnv ?? defaultEnvVar}. Type new value to replace.`
              : `Will be written to env var ${draft.apiKeyEnv ?? defaultEnvVar}`
          }
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Model (optional)</Label>
          <Input
            value={draft.model}
            onChange={(e) => onChange({ model: e.target.value })}
            placeholder={defaultModel || "preset default"}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Base URL (optional)</Label>
          <Input
            value={draft.baseUrl}
            onChange={(e) => onChange({ baseUrl: e.target.value })}
            placeholder={(preset?.defaultBaseUrl.openai_chat ??
              preset?.defaultBaseUrl.anthropic_messages ??
              preset?.defaultBaseUrl.openai_embeddings ??
              "") as string}
          />
        </div>
      </div>

      {preset && (
        <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
          <span>
            Speaks: <span className="font-mono">{preset.wireProtocols.join(", ")}</span>
          </span>
          {!preset.supportsEmbedding && <span>· cannot embed</span>}
        </div>
      )}
    </div>
  );
}

function RoutingRow({
  label,
  description,
  value,
  providers,
  presetById,
  requireProtocol,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  providers: DraftProvider[];
  presetById: Map<string, PresetMeta>;
  requireProtocol: "chat" | "embedding";
  onChange: (v: string) => void;
}) {
  const eligible = providers.filter((p) => {
    if (p.id === "") return false;
    const preset = presetById.get(p.preset);
    if (!preset) return false;
    return requireProtocol === "embedding" ? preset.supportsEmbedding : preset.supportsChat;
  });
  const NONE = "__none__";
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 items-start">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Select
        value={value === "" ? NONE : value}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="None — fallback mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None — fallback mode</SelectItem>
          {eligible.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.id} <span className="text-muted-foreground">({p.preset})</span>
            </SelectItem>
          ))}
          {eligible.length === 0 && (
            <SelectItem value="__disabled__" disabled>
              No eligible providers — add one above
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function suggestProviderId(presetId: string, existing: DraftProvider[]): string {
  const base = `my-${presetId}`;
  const taken = new Set(existing.map((e) => e.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base}-${i}`;
    if (!taken.has(cand)) return cand;
  }
  return `${base}-${Date.now()}`;
}

// Re-export for App.tsx
export default InstanceLlmProvidersSettings;
