import Router from "koa-router";
import { handleWebhookEvent } from "./service";
import Stripe from "stripe";
import { PaymentProvider } from "./adapters";

const name = "gateway";
const router = new Router();

// Initialize Stripe for webhook signature verification
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Handle Stripe webhook events
router.post("/webhook/stripe", async (ctx: any) => {
  let event: Stripe.Event;

  // Verify webhook signature
  try {
    const signature = ctx.headers["stripe-signature"] as string;

    // If webhook secret is configured, verify the signature
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(
        ctx.request.body,
        signature,
        webhookSecret
      );
    } else {
      // For development or if no webhook secret is set
      event = ctx.request.body;
      console.warn(
        "Webhook signature verification skipped - webhook secret not configured"
      );
    }

    // Process the event
    const result = await handleWebhookEvent(event, PaymentProvider.STRIPE);

    if (result.success) {
      ctx.body = { received: true, message: result.message };
    } else {
      console.error("Webhook processing error:", result.message);
      ctx.status = 400;
      ctx.body = { received: false, error: result.message };
    }
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    ctx.status = 400;
    ctx.body = { received: false, error: err.message };
  }
});

// Generic webhook endpoint that can be extended for other providers
router.post("/webhook/:provider", async (ctx: any) => {
  const providerName = ctx.params.provider;

  try {
    // Map the provider name to PaymentProvider enum
    let provider: PaymentProvider;

    switch (providerName.toLowerCase()) {
      case "stripe":
        provider = PaymentProvider.STRIPE;
        break;
      // Add other providers here
      default:
        throw new Error(`Unsupported payment provider: ${providerName}`);
    }

    // Process the event with the appropriate provider
    const result = await handleWebhookEvent(ctx.request.body, provider);

    if (result.success) {
      ctx.body = { received: true, message: result.message };
    } else {
      console.error(
        `${providerName} webhook processing error:`,
        result.message
      );
      ctx.status = 400;
      ctx.body = { received: false, error: result.message };
    }
  } catch (err: any) {
    console.error(`${providerName} webhook error:`, err.message);
    ctx.status = 400;
    ctx.body = { received: false, error: err.message };
  }
});

export const main = router;
export { name };
