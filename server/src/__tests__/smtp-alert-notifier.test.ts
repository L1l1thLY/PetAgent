import { describe, it, expect, vi } from "vitest";
import { SmtpAlertNotifier } from "../services/smtp-alert-notifier.js";

const baseAlert = {
  scopeKind: "company" as const,
  scopeId: "co-1",
  label: "Acme Co",
  budgetCents: 100_00,
  spentCents: 95_00,
  utilization: 0.95,
  level: "critical" as const,
  sendEmail: true,
  autoPause: false,
};

describe("SmtpAlertNotifier", () => {
  it("calls sendMail with from / to / subject / body derived from alert", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "m-1" }));
    const transport = { sendMail };
    const notifier = new SmtpAlertNotifier({
      transport: transport as never,
      from: "alerts@petagent.local",
      adminAddresses: ["admin@example.com"],
    });
    await notifier.notify(baseAlert);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = (sendMail.mock.calls[0] as unknown[])[0] as {
      from: string;
      to: string | string[];
      subject: string;
      text: string;
    };
    expect(args.from).toBe("alerts@petagent.local");
    expect(args.to).toEqual(["admin@example.com"]);
    expect(args.subject).toMatch(/critical/i);
    expect(args.subject).toContain("Acme Co");
    expect(args.text).toContain("95");
    expect(args.text).toContain("100");
  });

  it("skips alerts with sendEmail=false", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "m" }));
    const notifier = new SmtpAlertNotifier({
      transport: { sendMail } as never,
      from: "f@x",
      adminAddresses: ["a@x"],
    });
    await notifier.notify({ ...baseAlert, sendEmail: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not throw when sendMail rejects (logs warning)", async () => {
    const sendMail = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const warns: string[] = [];
    const notifier = new SmtpAlertNotifier({
      transport: { sendMail } as never,
      from: "f@x",
      adminAddresses: ["a@x"],
      logger: { warn: (msg) => warns.push(String(msg)) },
    });
    await expect(notifier.notify(baseAlert)).resolves.toBeUndefined();
    expect(warns.length).toBe(1);
    expect(warns[0]).toMatch(/smtp/i);
  });

  it("returns a no-op when adminAddresses is empty", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "m" }));
    const notifier = new SmtpAlertNotifier({
      transport: { sendMail } as never,
      from: "f@x",
      adminAddresses: [],
    });
    await notifier.notify(baseAlert);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
