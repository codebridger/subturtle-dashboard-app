import { PaymentAdapter, PaymentProvider } from "./types";
import { StripeAdapter } from "./stripe.adapter";

/**
 * Factory for creating and managing payment adapters
 */
export class PaymentAdapterFactory {
  private static instance: PaymentAdapterFactory;
  private adapters: Map<PaymentProvider, PaymentAdapter> = new Map();
  private defaultProvider: PaymentProvider = PaymentProvider.STRIPE;

  private constructor() {}

  /**
   * Get singleton instance of the factory
   */
  public static getInstance(): PaymentAdapterFactory {
    if (!PaymentAdapterFactory.instance) {
      PaymentAdapterFactory.instance = new PaymentAdapterFactory();
    }
    return PaymentAdapterFactory.instance;
  }

  /**
   * Register a payment adapter
   */
  public registerAdapter(adapter: PaymentAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /**
   * Get a payment adapter by provider
   */
  public getAdapter(provider: PaymentProvider): PaymentAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(
        `Payment adapter for provider ${provider} not registered`
      );
    }
    return adapter;
  }

  /**
   * Get the default payment adapter
   */
  public getDefaultAdapter(): PaymentAdapter {
    return this.getAdapter(this.defaultProvider);
  }

  /**
   * Set the default payment provider
   */
  public setDefaultProvider(provider: PaymentProvider): void {
    if (!this.adapters.has(provider)) {
      throw new Error(
        `Payment adapter for provider ${provider} not registered`
      );
    }
    this.defaultProvider = provider;
  }

  /**
   * Initialize adapters with configuration
   */
  public async initialize(): Promise<void> {
    // Initialize Stripe adapter by default
    const stripeAdapter = new StripeAdapter(
      process.env.STRIPE_SECRET_KEY || ""
    );
    await stripeAdapter.initialize();
    this.registerAdapter(stripeAdapter);
  }
}

// Export factory instance and types
export * from "./types";
export const paymentAdapterFactory = PaymentAdapterFactory.getInstance();
