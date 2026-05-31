<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
        <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-[#0e1726]">
            <div class="mb-4 flex items-center justify-between">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white-light">{{ t('subscription.checkout.title', { plan: planName }) }}</h3>
                <button type="button" class="text-gray-400 hover:text-gray-600" @click="$emit('close')">
                    <Icon name="IconX" class="h-5 w-5" />
                </button>
            </div>

            <div v-if="loading" class="py-10 text-center text-gray-500">{{ t('subscription.checkout.loading') }}</div>

            <div v-else-if="error" class="rounded-lg bg-red-100 p-4 text-sm text-red-700">{{ error }}</div>

            <div v-else>
                <!-- Localized price (EUR for EU visitors via Adaptive Pricing) -->
                <p class="mb-4 text-2xl font-bold text-gray-900 dark:text-white-light">
                    {{ localizedTotal }}
                    <span class="text-sm font-medium text-gray-500">/ {{ cadence === 'annual' ? t('subscription.pricing.year') : t('subscription.pricing.month') }}</span>
                </p>

                <!-- Stripe Currency Selector Element (required when localizing prices) -->
                <div ref="currencyElRef" class="mb-4"></div>
                <!-- Stripe Payment Element -->
                <div ref="paymentElRef" class="mb-4"></div>

                <Button block color="primary" :loading="paying" :label="t('subscription.checkout.pay')" @click="pay" />
                <p v-if="payError" class="mt-2 text-center text-sm text-red-600">{{ payError }}</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { loadStripe } from '@stripe/stripe-js';
import { Button, Icon } from 'pilotui/elements';
import { functionProvider } from '@modular-rest/client';
import { useProfileStore } from '~/stores/profile';
import type { Cadence, TierId } from '~/types/tiers';

const props = defineProps<{ tierId: TierId; cadence: Cadence; planName: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'success'): void }>();

const { t } = useI18n();
const config = useRuntimeConfig();
const profileStore = useProfileStore();

const loading = ref(true);
const paying = ref(false);
const error = ref('');
const payError = ref('');
const localizedTotal = ref('');
const currencyElRef = ref<HTMLElement | null>(null);
const paymentElRef = ref<HTMLElement | null>(null);

// The Checkout Elements SDK + its actions (loosely typed — glue code).
let sdk: any = null;
let actions: any = null;

const cadence = computed(() => props.cadence);

// Re-read the localized total whenever the SDK state changes (e.g. the customer
// switches currency in the Currency Selector).
function refreshTotal() {
    try {
        const session = actions?.getSession?.();
        // Show the recurring per-period localized price (e.g. "€13.19"). The
        // session "total" is the amount due TODAY, which is 0 during a free trial,
        // so prefer the line item's unitAmount.
        const li = session?.lineItems?.[0];
        localizedTotal.value =
            li?.unitAmount?.amount || session?.total?.total?.amount || '';
    } catch {
        /* ignore */
    }
}

onMounted(async () => {
    try {
        const pk = config.public.STRIPE_PUBLISHABLE_KEY as string | undefined;
        if (!pk) {
            throw new Error(t('subscription.checkout.no-key'));
        }

        // 1. Server creates a ui_mode:'custom' session with Adaptive Pricing -> clientSecret.
        const { clientSecret } = await functionProvider.run<{ clientSecret: string; sessionId: string }>({
            name: 'createCustomCheckoutSession',
            args: {
                tierId: props.tierId,
                cadence: props.cadence,
                userId: profileStore.authUser?.id,
                successUrl: `${window.location.origin}/#/payment-success`,
            },
        });

        // 2. Initialize the Checkout Elements SDK; mark the integration adaptive-ready.
        const stripe = await loadStripe(pk);
        if (!stripe) throw new Error(t('subscription.checkout.no-key'));
        sdk = (stripe as any).initCheckoutElementsSdk({
            clientSecret,
            adaptivePricing: { allowed: true },
        });

        const res = await sdk.loadActions();
        if (res.type !== 'success') {
            throw new Error(res.error?.message || t('subscription.checkout.load-failed'));
        }
        actions = res.actions;

        // Reveal the form BEFORE mounting so the Stripe Element containers exist in
        // the DOM — they live in the `v-else` block gated on `loading`, so mounting
        // into a not-yet-rendered ref throws "Make sure to call mount() with a valid
        // DOM element or selector".
        loading.value = false;
        await nextTick();

        // 3. Show the localized amount + mount the currency selector and payment form.
        refreshTotal();
        sdk.on('change', refreshTotal);
        sdk.createCurrencySelectorElement().mount(currencyElRef.value as HTMLElement);
        sdk.createPaymentElement().mount(paymentElRef.value as HTMLElement);
    } catch (e: any) {
        error.value = e?.message || t('subscription.checkout.load-failed');
        loading.value = false;
    }
});

onBeforeUnmount(() => {
    try {
        sdk?.getPaymentElement?.()?.unmount?.();
        sdk?.getCurrencySelectorElement?.()?.unmount?.();
    } catch {
        /* ignore */
    }
});

async function pay() {
    paying.value = true;
    payError.value = '';
    try {
        const result = await actions.confirm({
            returnUrl: `${window.location.origin}/#/payment-success`,
        });
        // Non-redirect payment methods (e.g. card without 3DS) resolve here.
        if (result?.type === 'error') {
            payError.value = result.error?.message || t('subscription.checkout.pay-failed');
        } else {
            emit('success');
        }
    } catch (e: any) {
        payError.value = e?.message || t('subscription.checkout.pay-failed');
    } finally {
        paying.value = false;
    }
}
</script>
