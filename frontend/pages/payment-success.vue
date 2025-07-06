<template>
    <div class="container mx-auto px-4 py-12">
        <div class="mx-auto max-w-lg overflow-hidden rounded-lg bg-white shadow-md">
            <div class="p-6" v-if="isLoading">
                <div class="text-center">
                    <h2 class="mb-4 text-2xl font-semibold">{{ t('subscription.verifying-payment') }}</h2>
                    <p class="text-gray-600">{{ t('subscription.please-wait') }}</p>
                </div>
            </div>

            <div class="p-6" v-else-if="paymentSuccess">
                <div class="text-center">
                    <div class="mb-4 text-green-500">
                        <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 class="mb-4 text-2xl font-semibold">{{ t('subscription.payment-successful') }}</h2>
                    <p class="mb-6 text-gray-600">{{ t('subscription.subscription-activated') }}</p>
                    <div class="flex justify-center">
                        <NuxtLink to="/" class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md transition duration-300 hover:bg-blue-700">
                            {{ t('subscription.go-home') }}
                        </NuxtLink>
                    </div>
                </div>
            </div>

            <div class="p-6" v-else>
                <div class="text-center">
                    <div class="mb-4 text-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <h2 class="mb-4 text-2xl font-semibold">{{ t('subscription.payment-verification-failed') }}</h2>
                    <p class="mb-2 text-gray-600">{{ t('subscription.payment-verification-error') }}</p>
                    <p class="mb-6 text-gray-600" v-if="error">{{ error }}</p>
                    <div class="flex justify-center space-x-4">
                        <NuxtLink
                            to="/settings/subscription"
                            class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md transition duration-300 hover:bg-blue-700"
                        >
                            {{ t('subscription.try-again') }}
                        </NuxtLink>
                        <NuxtLink
                            to="/"
                            class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 shadow-md transition duration-300 hover:bg-gray-300"
                        >
                            {{ t('subscription.go-home') }}
                        </NuxtLink>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref, onMounted } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    const { t } = useI18n();
    const route = useRoute();

    const isLoading = ref(true);
    const paymentSuccess = ref(false);
    const error = ref('');

    // Define the payment verification response type
    interface PaymentVerificationResponse {
        success: boolean;
        paymentId?: string;
        status?: string;
        error?: string;
    }

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.payment-result'),
        // @ts-ignore
        middleware: ['auth'],
    });

    onMounted(async () => {
        // Check if we have a session ID in the URL
        const sessionId = route.query.session_id as string;

        if (!sessionId) {
            isLoading.value = false;
            error.value = t('subscription.missing-session-id');
            return;
        }

        try {
            // Verify the payment with the backend using functionProvider
            const result = await functionProvider.run<PaymentVerificationResponse>({
                name: 'verifyPayment',
                args: sessionId,
            });

            if (result.success) {
                paymentSuccess.value = true;
            } else {
                error.value = result.error || t('subscription.verification-failed');
            }
        } catch (err: any) {
            error.value = err.message || t('subscription.unexpected-error');
            console.error('Payment verification error:', err);
        } finally {
            isLoading.value = false;
        }
    });
</script>
