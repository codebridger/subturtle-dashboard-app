import Router from "koa-router";
import { handleWebhookEvent } from "./service";
import Stripe from "stripe";
import { PaymentProvider, PaymentAdapterFactory } from "./adapters";

const name = "gateway";
const getway = new Router();

// koa-body exposes the raw (unparsed) request body under this symbol when
// `koaBodyOptions.includeUnparsed` is enabled (see server/src/index.ts).
const UNPARSED_BODY = Symbol.for("unparsedBody");

// Handle Stripe webhook events
getway.post("/webhook/stripe", async (ctx: any) => {
  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = ctx.headers["stripe-signature"] as string | undefined;

    if (webhookSecret && signature) {
      // Stripe signature verification needs the exact raw request bytes.
      const rawBody = ctx.request.body?.[UNPARSED_BODY];
      if (!rawBody) {
        throw new Error(
          "Raw request body unavailable - cannot verify Stripe signature"
        );
      }
      const stripe = PaymentAdapterFactory.getStripeAdapter().stripe;
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
    } else {
      // No secret configured (local dev without `stripe listen`) - accept the
      // already-parsed body unverified, but warn loudly.
      console.warn(
        "[gateway] STRIPE_WEBHOOK_SECRET not set - webhook signature verification skipped"
      );
      event = ctx.request.body as Stripe.Event;
    }

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

// // Generic webhook endpoint that can be extended for other providers
// router.post("/webhook/:provider", async (ctx: any) => {
//   const providerName = ctx.params.provider;

//   try {
//     // Map the provider name to PaymentProvider enum
//     let provider: PaymentProvider;

//     switch (providerName.toLowerCase()) {
//       case "stripe":
//         provider = PaymentProvider.STRIPE;
//         break;
//       // Add other providers here
//       default:
//         throw new Error(`Unsupported payment provider: ${providerName}`);
//     }

//     // Process the event with the appropriate provider
//     const result = await handleWebhookEvent(ctx.request.body, provider);

//     if (result.success) {
//       ctx.body = { received: true, message: result.message };
//     } else {
//       console.error(
//         `${providerName} webhook processing error:`,
//         result.message
//       );
//       ctx.status = 400;
//       ctx.body = { received: false, error: result.message };
//     }
//   } catch (err: any) {
//     console.error(`${providerName} webhook error:`, err.message);
//     ctx.status = 400;
//     ctx.body = { received: false, error: err.message };
//   }
// });

export { name };
export const main = getway;
