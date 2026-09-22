import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import Stripe from "stripe";

const mockHandleWebhookEvent = jest.fn(async (_event: any, _provider: any) => ({ success: true, message: "ok" }));
jest.mock("../service", () => ({
  handleWebhookEvent: (event: any, provider: any) => mockHandleWebhookEvent(event, provider),
}));

// A real Stripe client, so signatures are generated and verified by Stripe's own code.
const mockStripe = new Stripe("sk_test_webhook_router");
jest.mock("../adapters", () => ({
  PaymentProvider: { STRIPE: "stripe" },
  PaymentAdapterFactory: { getStripeAdapter: () => ({ stripe: mockStripe }) },
}));

const { main: gatewayRouter } = require("../router");
const handler = gatewayRouter.stack.find((layer: any) => layer.path === "/webhook/stripe").stack[0];

const SECRET = "whsec_webhook_router_test";
const UNPARSED_BODY = Symbol.for("unparsedBody");
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: {} } });

async function deliver(signature?: string) {
  const ctx: any = {
    headers: signature ? { "stripe-signature": signature } : {},
    request: { body: { ...JSON.parse(payload), [UNPARSED_BODY]: payload } },
    status: 200,
    body: undefined,
  };
  await handler(ctx, async () => undefined);
  return ctx;
}

const env = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
});

describe("POST /gateway/webhook/stripe", () => {
  it("processes an event whose signature matches the configured secret", async () => {
    const ctx = await deliver(mockStripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }));

    expect(ctx.status).toBe(200);
    expect(mockHandleWebhookEvent).toHaveBeenCalledTimes(1);
    expect((mockHandleWebhookEvent.mock.calls[0][0] as any).id).toBe("evt_1");
  });

  it("rejects an event without a signature when a secret is configured", async () => {
    const ctx = await deliver();

    expect(ctx.status).toBe(400);
    expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects an event signed with another secret", async () => {
    const ctx = await deliver(mockStripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" }));

    expect(ctx.status).toBe(400);
    expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
  });

  it("refuses unsigned events in production when no secret is configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";

    const ctx = await deliver();

    expect(ctx.status).toBe(400);
    expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
  });

  it("accepts unsigned events outside production when no secret is configured (local dev)", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.NODE_ENV = "development";

    const ctx = await deliver();

    expect(ctx.status).toBe(200);
    expect(mockHandleWebhookEvent).toHaveBeenCalledTimes(1);
  });
});
