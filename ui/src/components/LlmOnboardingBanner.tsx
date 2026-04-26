import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X, AlertCircle, RotateCw, CheckCircle2 } from "lucide-react";
import {
  llmProvidersApi,
  type LlmProvidersConfig,
  type PresetMeta,
} from "@/api/llmProviders";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const DISMISS_KEY = "petagent.llm-onboarding.dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // localStorage unavailable (private mode) — best effort.
  }
}

export function LlmOnboardingBanner() {
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.instance.llmProviders,
    queryFn: () => llmProvidersApi.get(),
    // Banner is best-effort — don't retry forever if backend hiccups.
    retry: 1,
  });

  if (dismissed) return null;
  if (!query.data) return null;
  // Only show banner when nothing useful is configured.
  if (query.data.hasAnyResolvedKey) return null;

  return (
    <>
      <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 px-4 py-3 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-sky-600 shrink-0" />
        <div className="flex-1 text-sm">
          <div className="font-medium">Set up an LLM provider to unlock the smart-agent stack</div>
          <div className="text-muted-foreground text-xs">
            Right now Psychologist + Reflector + Notes search are running in fallback mode (no LLM
            calls). Add a Kimi / Minimax / Anthropic / OpenAI key in 30 seconds.
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          Configure
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={() => {
            markDismissed();
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {dialogOpen && (
        <OnboardingDialog
          data={query.data}
          onClose={() => setDialogOpen(false)}
          onDone={() => {
            markDismissed();
            setDismissed(true);
          }}
        />
      )}
    </>
  );
}

function OnboardingDialog({
  data,
  onClose,
  onDone,
}: {
  data: LlmProvidersConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [presetId, setPresetId] = useState<string>(() => pickDefaultPreset(data.presets));
  const [apiKey, setApiKey] = useState("");
  const [usePsychologist, setUsePsychologist] = useState(true);
  const [useReflector, setUseReflector] = useState(true);
  const [useEmbedding, setUseEmbedding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const preset = useMemo(
    () => data.presets.find((p) => p.id === presetId) ?? null,
    [data.presets, presetId],
  );

  // If selected preset can't embed (e.g. anthropic), force the embedding box off.
  useEffect(() => {
    if (preset && !preset.supportsEmbedding && useEmbedding) {
      setUseEmbedding(false);
    }
  }, [preset, useEmbedding]);

  const mutation = useMutation({
    mutationFn: () => {
      const providerId = `my-${presetId}`;
      return llmProvidersApi.update({
        providers: [{ id: providerId, preset: presetId, apiKey: apiKey.trim() }],
        routing: {
          ...(usePsychologist ? { psychologist: providerId } : {}),
          ...(useReflector ? { reflector: providerId } : {}),
          ...(useEmbedding && preset?.supportsEmbedding ? { embedding: providerId } : {}),
        },
      });
    },
    onSuccess: async () => {
      setError(null);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.llmProviders });
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Save failed");
    },
  });

  function handleSave() {
    if (apiKey.trim().length === 0) {
      setError("API key is required.");
      return;
    }
    if (!usePsychologist && !useReflector && !useEmbedding) {
      setError("Pick at least one subsystem to enable.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure LLM Provider</DialogTitle>
          <DialogDescription>
            Pick one provider, paste a key, choose which subsystems should use it.
            You can add more providers later in Instance Settings → LLM Providers.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-3">
            <div className="border border-green-500/40 bg-green-500/5 p-3 rounded text-sm flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Saved.</div>
                <div className="text-xs text-muted-foreground">
                  Restart the server for changes to take effect. If you started PetAgent via{" "}
                  <code>pnpm dev:server</code> (watch mode) it'll auto-reload — otherwise{" "}
                  <kbd className="px-1 py-0.5 rounded bg-muted text-xs">Ctrl+C</kbd> + restart.
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  onDone();
                  onClose();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Provider</Label>
              <Select value={presetId} onValueChange={setPresetId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset && (
                <div className="text-xs text-muted-foreground">
                  Default chat model: <span className="font-mono">{preset.defaultModels.openai_chat ?? preset.defaultModels.anthropic_messages ?? "—"}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">API key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
              <div className="text-xs text-muted-foreground">
                Stored in <code>{data.envPath}</code> (chmod 600).
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Use this provider for:</Label>
              <div className="space-y-1.5">
                <CheckRow
                  checked={usePsychologist}
                  onChange={setUsePsychologist}
                  label="Psychologist"
                  hint="Emotion-state classifier (catches stuck agents)"
                />
                <CheckRow
                  checked={useReflector}
                  onChange={setUseReflector}
                  label="Reflector"
                  hint="Writes Notes after each heartbeat (lessons learned)"
                />
                <CheckRow
                  checked={useEmbedding}
                  onChange={setUseEmbedding}
                  label="Embedding"
                  hint={
                    preset && !preset.supportsEmbedding
                      ? `${preset.displayName} does not support embeddings.`
                      : "Notes semantic search"
                  }
                  disabled={!preset?.supportsEmbedding}
                />
              </div>
            </div>

            {error && (
              <div className="border border-destructive/50 bg-destructive/10 text-destructive p-2 rounded text-xs flex gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  // Skip-for-now also dismisses the banner so users aren't nagged.
                  onDone();
                  onClose();
                }}
              >
                Skip for now
              </Button>
              <Button onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? <RotateCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </label>
  );
}

function pickDefaultPreset(presets: PresetMeta[]): string {
  // Prefer kimi if available — most-likely user case for v0.5.1 China-friendly default.
  if (presets.some((p) => p.id === "kimi")) return "kimi";
  if (presets.length > 0) return presets[0].id;
  return "anthropic";
}
