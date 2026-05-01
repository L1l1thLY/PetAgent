import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import type { RoleTemplateDescriptor } from "../api/role-templates";
import {
  buildHireFormDefaults,
  buildHirePayload,
  hasErrors,
  validateHireForm,
  type HireFormState,
} from "../lib/hire-form";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface HireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  template: RoleTemplateDescriptor;
  onHired?: (agentId: string) => void;
}

export function HireDialog({
  open,
  onOpenChange,
  companyId,
  template,
  onHired,
}: HireDialogProps) {
  const { t } = useTranslation("board");
  const queryClient = useQueryClient();
  const [state, setState] = useState<HireFormState>(() =>
    buildHireFormDefaults(template),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errors = useMemo(() => validateHireForm(state), [state]);

  const hireMutation = useMutation({
    mutationFn: async () => {
      const payload = buildHirePayload(state);
      return agentsApi.create(companyId, payload);
    },
    onSuccess: (agent) => {
      setSubmitError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });
      if (agent && typeof (agent as { id?: unknown }).id === "string") {
        onHired?.((agent as { id: string }).id);
      }
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof Error ? err.message : String(err));
    },
  });

  const onField =
    <K extends keyof HireFormState>(key: K) =>
    (value: HireFormState[K]) =>
      setState((s) => ({ ...s, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("hireDialog.title", { role: template.roleType })}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (hasErrors(errors)) return;
            hireMutation.mutate();
          }}
          className="space-y-3"
        >
          <Field label={t("hireDialog.nameLabel")} error={errors.name}>
            <input
              value={state.name}
              onChange={(e) => onField("name")(e.target.value)}
              placeholder={t("hireDialog.namePlaceholder")}
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
              autoFocus
            />
          </Field>
          <Field label={t("hireDialog.titleLabel")}>
            <input
              value={state.title}
              onChange={(e) => onField("title")(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("hireDialog.adapterTypeLabel")} error={errors.adapterType}>
              <input
                value={state.adapterType}
                onChange={(e) => onField("adapterType")(e.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
              />
            </Field>
            <Field label={t("hireDialog.roleTypeLabel")} error={errors.roleType}>
              <input
                value={state.roleType}
                onChange={(e) => onField("roleType")(e.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("hireDialog.modelLabel")}>
              <input
                value={state.model}
                onChange={(e) => onField("model")(e.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
              />
            </Field>
            <Field label={t("hireDialog.budgetLabel")} error={errors.budgetUsd}>
              <input
                value={state.budgetUsd}
                onChange={(e) => onField("budgetUsd")(e.target.value)}
                inputMode="decimal"
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
              />
            </Field>
          </div>
          <Field label={t("hireDialog.skillsLabel")}>
            <input
              value={state.skills}
              onChange={(e) => onField("skills")(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm font-mono"
              placeholder={t("hireDialog.skillsPlaceholder")}
            />
          </Field>
          <Field label={t("hireDialog.reportsToLabel")}>
            <input
              value={state.reportsTo}
              onChange={(e) => onField("reportsTo")(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm font-mono"
            />
          </Field>

          {submitError && (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={hireMutation.isPending}
            >
              {t("hireDialog.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={hasErrors(errors) || hireMutation.isPending}
            >
              {hireMutation.isPending ? t("hireDialog.submitting") : t("hireDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </label>
  );
}
