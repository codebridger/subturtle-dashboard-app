<template>
    <div class="relative min-h-screen">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none">
        </div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none">
        </div>

        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <PageHeader :title="t('subscription.subscription-plans')" overline="MEMBERSHIP" />

            <div class="flex flex-col gap-8">
                <!-- Active Plan Card -->
                <Card v-if="activeSubscriptionData" class="w-full rounded-lg border border-gray-100 shadow-sm">
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h2 class="text-xl font-bold text-gray-900">{{ activePlanName }}</h2>
                                <p class="mt-1 text-sm text-gray-600">
                                    <span v-if="isCanceling">{{ t('subscription.canceling', { date:
                                        formatDate(activeSubscriptionData.end_date) }) }}</span>
                                    <span v-else-if="isTrialing">{{ t('subscription.trial-active', { days:
                                        activeSubscriptionData.remaining_days ?? 0 }) }}</span>
                                    <span v-else>{{ t('subscription.started-at') }} {{
                                        formatDate(activeSubscriptionData.start_date) }}</span>
                                </p>
                            </div>
                            <Button v-if="isTrialing" color="primary" size="md"
                                :label="t('subscription.manage-subscription')" @click="showCancelOffRamp = true" />
                            <Button v-else color="primary" size="md"
                                :label="t('subscription.manage-subscription')" @click="goToPortal" />
                        </div>
                        <div class="flex items-center gap-4">
                            <div v-if="!isTrialing"
                                class="flex h-8 items-center gap-2 whitespace-nowrap rounded-full bg-gray-600 px-3 py-1.5 text-sm font-medium text-white">
                                <Icon name="IconClock" class="h-4 w-4" />
                                <span>{{ t('billing.days-left') }}: {{ activeSubscriptionData.remaining_days ?? 0 }}</span>
                            </div>
                            <Progress :value="activeSubscriptionData.usage_percentage ?? 0" :max="100" size="md"
                                color="primary" />
                        </div>
                    </div>
                </Card>

                <!-- AI usage — internal metering (Dev Only) -->
                <Card v-if="config.public.isNotProduction" class="w-full rounded-lg border border-gray-100 shadow-sm">
                    <template v-if="activeSubscriptionData">
                        <h2 class="text-xl font-bold text-gray-900">AI usage — internal metering (dev only)</h2>
                        <div class="my-6 overflow-x-auto">
                            <table class="w-full table-auto border-collapse">
                                <thead>
                                    <tr class="border-b border-gray-200">
                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{
                                            t('subscription.metric') }}</th>
                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Internal units
                                        </th>
                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">USD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="border-b border-gray-200">
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.total') }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{
                                            activeSubscriptionData.total_credits }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{
                                            activeSubscriptionData.total_credit_in_usd }}</td>
                                    </tr>
                                    <tr class="border-b border-gray-200">
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.available') }}
                                        </td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{
                                            activeSubscriptionData.available_credit }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">${{
                                            activeSubscriptionData.available_credit_in_usd }}</td>
                                    </tr>
                                    <tr>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.used') }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{
                                            activeSubscriptionData.credits_used }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">${{
                                            activeSubscriptionData.used_credit_in_usd }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </template>

                    <!-- Profile Reset Section -->
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Profile Reset</h3>
                            <p class="mt-1 text-sm text-gray-500">Clear all subscription and freemium data for testing
                                purposes. This action cannot be undone.</p>
                        </div>
                        <Button @click="handleProfileReset" color="danger" :loading="isResetLoading" class="ml-4">Reset
                            Profile</Button>
                    </div>
                </Card>

                <!-- Billing cadence + currency controls -->
                <div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
                    <SwitchBall id="cadence-toggle" v-model="isAnnual" color="primary"
                        :label="t('subscription.pricing.annual-toggle')" sublabel="" />
                    <div class="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-[#1b2e4b]">
                        <button v-for="c in currencies" :key="c" type="button"
                            class="px-3 py-1.5 text-sm font-medium transition-colors" :class="currency === c
                                ? 'bg-primary text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-[#0e1726] dark:text-white-dark'"
                            @click="currency = c">
                            {{ c.toUpperCase() }}
                        </button>
                    </div>
                </div>

                <!-- Pricing Cards -->
                <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <Card v-for="plan in plans" :key="plan.id"
                        class="relative flex h-full w-full flex-col rounded-lg border shadow-none transition-all duration-300"
                        :class="plan.id === 'learner'
                            ? 'border-primary ring-1 ring-primary/30'
                            : 'border-[#e0e6ed] dark:border-[#1b2e4b]'">
                        <!-- Most popular badge -->
                        <span v-if="plan.id === 'learner'"
                            class="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                            {{ t('subscription.pricing.most-popular') }}
                        </span>

                        <div class="flex flex-grow flex-col p-5">
                            <!-- Name + tagline -->
                            <div class="flex items-center gap-2">
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white-light">{{ plan.name }}</h3>
                                <span v-if="plan.status === 'dark'"
                                    class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-[#1b2e4b] dark:text-white-dark">
                                    {{ t('subscription.pricing.coming-soon') }}
                                </span>
                            </div>
                            <p class="mt-1 min-h-[2.5rem] text-sm text-gray-500">{{ plan.tagline }}</p>

                            <!-- Price line -->
                            <div class="mt-4 min-h-[3.5rem]">
                                <template v-if="!plan.isPaid">
                                    <p class="text-lg font-semibold text-gray-900 dark:text-white-light">
                                        {{ t('subscription.pricing.starter-price') }}
                                    </p>
                                </template>
                                <template v-else>
                                    <p class="text-2xl font-bold text-gray-900 dark:text-white-light">
                                        {{ formatAmount(plan, cadence) }}
                                        <span class="text-sm font-medium text-gray-500">
                                            / {{ isAnnual ? t('subscription.pricing.year') :
                                                t('subscription.pricing.month') }}
                                        </span>
                                    </p>
                                    <p v-if="isAnnual" class="text-xs text-gray-400">
                                        {{ t('subscription.pricing.or-monthly', { price: formatAmount(plan, 'monthly') })
                                        }}
                                    </p>
                                </template>
                            </div>

                            <!-- Feature list -->
                            <ul class="my-6 flex-grow space-y-3">
                                <li v-for="feature in plan.featureLabels" :key="feature"
                                    class="flex items-start text-sm">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                                    <span class="text-gray-700 dark:text-white-dark">{{ feature }}</span>
                                </li>
                            </ul>

                            <!-- CTA -->
                            <div class="mt-auto">
                                <!-- Starter (free) — no actionable CTA -->
                                <Button v-if="!plan.isPaid" block disabled
                                    :label="isFreemium ? t('subscription.pricing.current-plan') : t('subscription.pricing.free-plan')" />

                                <!-- Learner — the single primary CTA -->
                                <template v-else-if="plan.id === 'learner'">
                                    <Button v-if="activePlanId === 'learner'" block color="primary"
                                        :label="t('subscription.manage-subscription')" @click="goToPortal" />
                                    <template v-else>
                                        <Button block color="primary" :loading="isLoading"
                                            :label="t('subscription.pricing.learner-cta')"
                                            @click="initiateCheckout('learner')" />
                                        <p class="mt-2 text-center text-xs text-gray-400">
                                            {{ t('subscription.pricing.learner-subline') }}
                                        </p>
                                    </template>
                                </template>

                                <!-- Fluent — dark / coming soon -->
                                <template v-else>
                                    <Button block outline color="secondary" :disabled="fluentNotified"
                                        :label="fluentNotified ? t('subscription.pricing.fluent-notified') : t('subscription.pricing.fluent-cta')"
                                        @click="notifyFluent" />
                                    <p class="mt-2 text-center text-xs text-gray-400">
                                        {{ t('subscription.pricing.fluent-helper') }}
                                    </p>
                                </template>
                            </div>
                        </div>
                    </Card>
                </div>

                <!-- Payment Status Messages -->
                <div v-if="error" class="rounded-lg bg-red-100 p-4 text-red-700">
                    {{ error }}
                </div>

                <!-- Cancel-trial off-ramp interstitial (shown before the Stripe portal) -->
                <LimitationModal v-model="showCancelOffRamp" :modal-title="t('subscription.cancel-offramp.title')"
                    :main-message="t('subscription.cancel-offramp.message')"
                    :sub-message="t('subscription.cancel-offramp.sub-message')" icon-name="IconLockDots"
                    :primary-button-label="t('subscription.cancel-offramp.stay')"
                    :secondary-button-label="t('subscription.cancel-offramp.continue')"
                    :auto-redirect-on-upgrade="false" @secondary="goToPortal" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Card, Button, Progress, Icon } from 'pilotui/elements';
import { SwitchBall } from 'pilotui/form';
import PageHeader from '~/components/common/PageHeader.vue';
import LimitationModal from '~/components/freemium_alerts/LimitationModal.vue';

import { ref, computed } from 'vue';
import { functionProvider } from '@modular-rest/client';
import type { PublicTierPlan, Cadence, Currency, TierId } from '~/types/tiers';
import { useProfileStore } from '~/stores/profile';
import { analytic } from '~/plugins/mixpanel';
import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';

const { t } = useI18n();
const config = useRuntimeConfig();
const profileStore = useProfileStore();

definePageMeta({
    layout: 'default',
    title: () => t('subscription.subscription-plans'),
    // @ts-ignore
    middleware: ['auth'],
});

const isLoading = ref(false);
const isResetLoading = ref(false);
const error = ref('');
const plans = ref<PublicTierPlan[]>([]);

const isAnnual = ref(false);
const cadence = computed<Cadence>(() => (isAnnual.value ? 'annual' : 'monthly'));
const currencies: Currency[] = ['usd', 'eur', 'gbp'];
const currency = ref<Currency>('usd');
const fluentNotified = ref(false);
const showCancelOffRamp = ref(false);

const activeSubscriptionData = computed(() => profileStore.activeSubscription);
const isFreemium = computed(() => profileStore.isFreemium);
const activePlanId = computed<TierId | undefined>(() => activeSubscriptionData.value?.tier);
const isTrialing = computed(() => activeSubscriptionData.value?.status === 'trialing');
const isCanceling = computed(() => !!activeSubscriptionData.value?.cancel_at_period_end);
const activePlanName = computed(() => activeSubscriptionData.value?.label || t('subscription.title'));

interface CheckoutResponse {
    sessionId: string;
    url: string;
    expiresAt: string;
}

const currencySymbols: Record<Currency, string> = { usd: '$', eur: '€', gbp: '£' };

function formatAmount(plan: PublicTierPlan, cad: Cadence): string {
    const amount = plan.pricing?.[cad]?.[currency.value];
    if (amount == null) return '';
    return `${currencySymbols[currency.value]}${amount.toFixed(2)}`;
}

function formatDate(d: string | Date | undefined): string {
    return d ? new Date(d).toLocaleDateString() : '';
}

function fetchPlans() {
    return functionProvider
        .run<PublicTierPlan[]>({
            name: 'getSubscriptionPlans',
            args: {},
        })
        .then((res) => {
            plans.value = res;
        });
}

onMounted(() => {
    fetchPlans();
});

// Initiate Stripe checkout for a paid tier at the selected cadence/currency.
async function initiateCheckout(tierId: TierId) {
    isLoading.value = true;
    error.value = '';

    try {
        const baseUrl = window.location.origin;
        const successUrl = `${baseUrl}/#/payment-success`;
        const cancelUrl = `${baseUrl}/#/payment-canceled`;

        const response = await functionProvider.run<CheckoutResponse>({
            name: 'createPaymentSession',
            args: {
                tierId,
                cadence: cadence.value,
                currency: currency.value,
                successUrl,
                cancelUrl,
                userId: profileStore.authUser?.id,
            },
        });

        if (response && response.url) {
            analytic.track(ANALYTICS_EVENTS.TRIAL_STARTED, {
                cadence: cadence.value,
                currency: currency.value,
            });
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

// Fluent ships dark — capture latent demand. Optimistically acknowledges in
// the UI, then persists to the waitlist and fires the analytics event.
async function notifyFluent() {
    fluentNotified.value = true;
    analytic.track(ANALYTICS_EVENTS.FLUENT_WAITLIST_SIGNUP);
    try {
        await functionProvider.run({
            name: 'notifyFluentWaitlist',
            args: { userId: profileStore.authUser?.id },
        });
    } catch (err) {
        console.error('Fluent waitlist signup failed:', err);
    }
}

// Hands the user to Stripe's hosted billing portal — payment method, invoices,
// and cancellation all live there rather than being reimplemented in-app.
// Reached directly by "Manage Subscription" for active subs, and via the
// cancel-trial off-ramp interstitial for trialing subs.
function goToPortal() {
    const url = activeSubscriptionData.value?.portal_url;
    if (url) window.location.href = url;
}

async function handleProfileReset() {
    if (!confirm('Are you sure you want to reset your profile? This will clear all subscription and freemium data and cannot be undone.')) {
        return;
    }

    isResetLoading.value = true;
    error.value = '';

    try {
        await functionProvider.run({
            name: 'clearSubscriptionAndFreemium',
            args: {
                userId: profileStore.authUser?.id,
            },
        });

        await profileStore.fetchSubscription();
        alert('Profile reset successfully! All subscription and freemium data has been cleared.');
        window.location.reload();
    } catch (err: any) {
        error.value = err.message || 'Failed to reset profile';
        console.error('Profile reset error:', err);
    } finally {
        isResetLoading.value = false;
    }
}
</script>
