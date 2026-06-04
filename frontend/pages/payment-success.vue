<template>
    <div class="container mx-auto px-4 py-12">
        <div class="mx-auto max-w-lg overflow-hidden rounded-lg bg-white shadow-md">
            <div class="p-6" v-if="isLoading">
                <div class="flex flex-col items-center justify-center gap-5 py-6 text-center">
                    <!-- Verifying-payment spinner: a faint track with a spinning primary arc. -->
                    <div class="relative h-16 w-16" role="status" :aria-label="t('subscription.verifying-payment')">
                        <div class="absolute inset-0 rounded-full border-4 border-primary/20"></div>
                        <div
                            class="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary">
                        </div>
                    </div>
                    <div>
                        <h2 class="text-2xl font-semibold">{{ t('subscription.verifying-payment') }}</h2>
                        <p class="mt-1 animate-pulse text-gray-600">{{ t('subscription.please-wait') }}</p>
                    </div>
                </div>
            </div>

            <div class="p-6" v-else>
                <div class="text-center">
                    <div class="mb-4 text-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16" fill="none"
                            viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 class="mb-4 text-2xl font-semibold">{{ t('subscription.payment-verification-failed') }}</h2>
                    <p class="mb-2 text-gray-600">{{ t('subscription.payment-verification-error') }}</p>
                    <p class="mb-6 text-gray-600" v-if="error">{{ error }}</p>
                    <div class="flex justify-center space-x-4">
                        <NuxtLink to="/settings/subscription"
                            class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md transition duration-300 hover:bg-blue-700">
                            {{ t('subscription.try-again') }}
                        </NuxtLink>
                        <NuxtLink to="/"
                            class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 shadow-md transition duration-300 hover:bg-gray-300">
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
import { toastSuccess } from 'pilotui/toast';
import { useProfileStore } from '~/stores/profile';
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const profileStore = useProfileStore();

const isLoading = ref(true);
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

// The Stripe webhook that writes the subscription runs asynchronously, so right
// after verifyPayment the profile store can still read "Free". Re-fetch a few
// times until the paid plan lands, so the subscription page we redirect to shows
// it immediately — no manual hard refresh, which is what made a tester think the
// payment failed and pay twice (B1). Resolves early once active; gives up at the cap.
async function refreshUntilPlanActive(maxAttempts = 10, delayMs = 1000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await profileStore.fetchSubscription();
        if (!profileStore.isFreemium) return;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
}

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
            // Pull the freshly-provisioned plan into the store, then hand the user to
            // their subscription page (which now shows the active plan). The verifying
            // spinner stays up through navigation, so there's no flash of the error
            // state and no separate success screen.
            await refreshUntilPlanActive();
            toastSuccess(`${t('subscription.payment-successful')} - ${t('subscription.subscription-activated')}`);
            await router.replace('/settings/subscription');
            return;
        }

        error.value = result.error || t('subscription.verification-failed');
    } catch (err: any) {
        error.value = err.message || t('subscription.unexpected-error');
        console.error('Payment verification error:', err);
    }

    isLoading.value = false;
});
</script>
