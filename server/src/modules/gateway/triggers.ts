import { DatabaseTrigger } from "@modular-rest/server";
import { Payment } from "./types";
import { paymentAdapterFactory } from "./adapters";
import { addCredit } from "../subscription/service";

export const whenPaymentCreatedAddCreadit = new DatabaseTrigger(
  "insert-one",
  async (context) => {
    const payment = context.query as Payment;

    // Only process successful payments
    if (payment.status === "succeeded") {
      try {
        // Get the appropriate adapter for this payment provider
        const adapter = paymentAdapterFactory.getAdapter(payment.provider);

        // Extract subscription details from the payment
        const subscriptionDetails = adapter.getSubscriptionDetails(payment);

        console.log("Payment subscription details:", subscriptionDetails);

        // Check if we have valid subscription details
        if (
          subscriptionDetails.creditsAmount &&
          subscriptionDetails.subscriptionDays
        ) {
          // Add credits to the user's account
          await addCredit(
            payment.user_id.toString(),
            subscriptionDetails.creditsAmount,
            subscriptionDetails.subscriptionDays,
            {
              paymentMethod: payment.provider,
              transactionId: payment.provider_data?.payment_id,
              amount: payment.amount,
              currency: payment.currency,
            }
          );

          console.log(
            `Added ${subscriptionDetails.creditsAmount} credits for ${subscriptionDetails.subscriptionDays} days to user ${payment.user_id}`
          );
        }
      } catch (error) {
        console.error("Error processing payment subscription:", error);
      }
    }
  }
);
