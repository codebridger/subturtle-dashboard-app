<template>
    <div class="container mx-auto px-4 py-8">
        <h1 class="mb-8 text-3xl font-bold">
            {{ t('subscription.subscription-plans') }}
        </h1>
        <div class="flex gap-8">
            <div class="w-1/4">
                <ProfileSidebar activeTab="subscription" />
            </div>
            <div class="flex w-3/4 flex-col gap-4">
                <Card class="mx-auto max-w-lg overflow-hidden rounded-lg bg-white !p-0 shadow-lg">
                    <div class="border-b bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <h2 class="text-2xl font-bold text-blue-700">{{ t('subscription.monthly-subscription') }}</h2>
                                <p class="mt-2 text-gray-600">{{ t('subscription.monthly-description') }}</p>
                            </div>
                            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600">
                                <span class="iconify text-3xl text-white solar--airbuds-case-bold"></span>
                            </div>
                        </div>
                    </div>

                    <div class="p-6">
                        <div class="mb-6">
                            <div class="mb-4 flex items-center justify-between">
                                <span class="font-medium text-gray-700">{{ t('subscription.price') }}</span>
                                <span class="text-2xl font-bold text-blue-700">£7.6</span>
                            </div>

                            <div class="mb-2 flex items-center justify-between">
                                <span class="font-medium text-gray-700">{{ t('subscription.credits') }}</span>
                                <span class="font-semibold">1000</span>
                            </div>

                            <div class="flex items-center justify-between">
                                <span class="font-medium text-gray-700">{{ t('subscription.duration') }}</span>
                                <span class="font-semibold">30 {{ t('subscription.days') }}</span>
                            </div>
                        </div>

                        <div class="my-6">
                            <h3 class="mb-4 text-lg font-semibold">{{ t('subscription.features') }}</h3>
                            <ul class="space-y-3">
                                <li class="flex items-start">
                                    <span class="solar--chat-round-live-bold iconify mr-3 mt-1 text-xl text-blue-600"></span>
                                    <span>Live session and practice with AI</span>
                                </li>
                                <li class="flex items-start">
                                    <span class="iconify mr-3 mt-1 text-xl text-blue-600 solar--document-add-bold"></span>
                                    <span>Auto Lecture Generator from your phrases</span>
                                </li>
                                <li class="flex items-start">
                                    <span class="iconify mr-3 mt-1 text-xl text-blue-600 solar--phone-calling-rounded-bold"></span>
                                    <span>Have AI coach on your Telegram with Call</span>
                                </li>
                                <li class="flex items-start">
                                    <span class="iconify mr-3 mt-1 text-xl text-blue-600 solar--check-circle-bold"></span>
                                    <span>All free features</span>
                                </li>
                            </ul>
                        </div>

                        <button
                            @click="initiateCheckout"
                            class="mt-6 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-4 font-semibold text-white shadow-md transition duration-300 hover:bg-blue-700"
                            :disabled="isLoading"
                        >
                            <span v-if="isLoading" class="flex items-center">
                                <svg class="-ml-1 mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                {{ t('subscription.processing') }}...
                            </span>
                            <span v-else class="flex items-center">
                                <span class="iconify mr-2 text-xl solar--wallet-money-bold"></span>
                                {{ t('subscription.subscribe-now') }}
                            </span>
                        </button>
                    </div>
                </Card>

                <!-- Payment Status Messages -->
                <div v-if="error" class="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
                    {{ error }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Card } from '@codebridger/lib-vue-components/elements.ts';

    import { ref } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    const { t } = useI18n();
    const isLoading = ref(false);
    const error = ref('');

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.subscription-plans'),
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
