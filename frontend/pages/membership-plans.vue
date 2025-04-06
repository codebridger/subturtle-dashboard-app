<template>
    <div class="container mx-auto px-4 py-8">
        <h1 class="mb-8 text-3xl font-bold">{{ t('subscription.membership-plans') }}</h1>

        <div class="mx-auto max-w-lg overflow-hidden rounded-lg bg-white shadow-md">
            <div class="border-b p-6">
                <h2 class="text-2xl font-semibold">{{ t('subscription.monthly-subscription') }}</h2>
                <p class="mt-2 text-gray-600">{{ t('subscription.monthly-description') }}</p>
            </div>

            <div class="p-6">
                <div class="mb-4 flex items-center justify-between">
                    <span class="text-gray-700">{{ t('subscription.price') }}</span>
                    <span class="text-xl font-bold">£7.6</span>
                </div>

                <button
                    @click="initiateCheckout"
                    class="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-md transition duration-300 hover:bg-blue-700"
                    :disabled="isLoading"
                >
                    <span v-if="isLoading">{{ t('subscription.processing') }}...</span>
                    <span v-else>{{ t('subscription.subscribe-now') }}</span>
                </button>
            </div>
        </div>

        <!-- Payment Status Messages -->
        <div v-if="error" class="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
            {{ error }}
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    const { t } = useI18n();
    const isLoading = ref(false);
    const error = ref('');

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.membership-plans'),
        // @ts-ignore
        middleware: ['auth'],
    });

    // Define response type interface
    interface CheckoutResponse {
        sessionId: string;
        url: string;
        expiresAt: string;
    }

    // Function to initiate the checkout process
    async function initiateCheckout() {
        isLoading.value = true;
        error.value = '';

        try {
            // Get the base URL for success/cancel redirects
            const baseUrl = window.location.origin;
            const successUrl = `${baseUrl}/#/payment-success`;
            const cancelUrl = `${baseUrl}/#/payment-canceled`;

            // Call the API to create a payment session using functionProvider
            const response = await functionProvider.run<CheckoutResponse>({
                name: 'createPaymentSession',
                args: {
                    productId: 'prod_S4nM68SkuYEHxm', // Use the Stripe product ID
                    successUrl,
                    cancelUrl,
                    userId: authUser.value?.id,
                },
            });

            // Redirect to Stripe checkout
            if (response && response.url) {
                window.location.href = response.url;
            } else {
                throw new Error(t('subscription.checkout-failed'));
            }
        } catch (err: any) {
            error.value = err.message || t('subscription.unexpected-error');
            console.error('Checkout error:', err);
        } finally {
            isLoading.value = false;
        }
    }
</script>
