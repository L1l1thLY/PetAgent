import { describe, it, expect } from "vitest";
import { createBudgetAlertEmailNotifier } from "../composition/budget-alert-notifier.js";

describe("createBudgetAlertEmailNotifier", () => {
  it("returns null when SMTP_HOST is unset", () => {
    expect(createBudgetAlertEmailNotifier({})).toBeNull();
  });

  it("returns null when SMTP_FROM or SMTP_TO_ADMIN is missing", () => {
    expect(createBudgetAlertEmailNotifier({ SMTP_HOST: "smtp.example.com" })).toBeNull();
    expect(
      createBudgetAlertEmailNotifier({
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "alerts@petagent.local",
      }),
    ).toBeNull();
  });

  it("returns a SmtpAlertNotifier when host + from + admin are present", () => {
    const out = createBudgetAlertEmailNotifier({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "alerts",
      SMTP_PASSWORD: "secret",
      SMTP_FROM: "alerts@petagent.local",
      SMTP_TO_ADMIN: "admin@example.com,ops@example.com",
    });
    expect(out).not.toBeNull();
  });
});
