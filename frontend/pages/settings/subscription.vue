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

                <!-- Billing cadence toggle (GBP base; Stripe localizes at checkout) -->
                <div class="flex items-center justify-center">
                    <SwitchBall id="cadence-toggle" v-model="isAnnual" color="primary"
                        :label="t('subscription.pricing.annual-toggle')" sublabel="" />
                </div>

                <!-- Pricing Cards (Reader / Learner / Coach) -->
                <div v-if="isLoadingPlans" class="py-12 text-center text-gray-500">
                    {{ t('subscription.pricing.loading') }}
                </div>
                <div v-else-if="plansError" class="rounded-lg bg-red-100 p-4 text-center text-red-700">
                    {{ t('subscription.pricing.error') }}
                </div>
                <div v-else-if="!paidPlans.length" class="py-12 text-center text-gray-500">
                    {{ t('subscription.pricing.empty') }}
                </div>
                <div v-else class="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <Card v-for="plan in paidPlans" :key="plan.id"
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
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white-light">{{ plan.name }}</h3>
                            <p class="mt-1 min-h-[2.5rem] text-sm text-gray-500">{{ plan.tagline }}</p>

                            <!-- Price line (GBP base) -->
                            <div class="mt-4 min-h-[3.5rem]">
                                <p class="text-2xl font-bold text-gray-900 dark:text-white-light">
                                    {{ formatAmount(plan, cadence) }}
                                    <span class="text-sm font-medium text-gray-500">
                                        / {{ isAnnual ? t('subscription.pricing.year') :
                                            t('subscription.pricing.month') }}
                                    </span>
                                </p>
                                <p v-if="isAnnual" class="text-xs text-gray-400">
                                    {{ t('subscription.pricing.or-monthly', { price: formatAmount(plan, 'monthly') }) }}
                                </p>
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
                                <!-- Already on this plan -->
                                <Button v-if="activePlanId === plan.id" block color="primary"
                                    :label="t('subscription.manage-subscription')" @click="goToPortal" />

                                <!-- Learner — the trial CTA -->
                                <template v-else-if="plan.id === 'learner'">
                                    <Button block color="primary" :loading="isLoading"
                                        :label="t('subscription.pricing.learner-cta')"
                                        @click="initiateCheckout(plan.id)" />
                                    <p class="mt-2 text-center text-xs text-gray-400">
                                        {{ t('subscription.pricing.learner-subline') }}
                                    </p>
                                </template>

                                <!-- Reader / Coach -->
                                <Button v-else block outline color="primary" :loading="isLoading"
                                    :label="t('subscription.pricing.choose-plan', { name: plan.name })"
                                    @click="initiateCheckout(plan.id)" />
                            </div>
                        </div>
                    </Card>
                </div>

                <!-- Starter — "Continue with Free" link below the cards -->
                <div v-if="!isLoadingPlans && !plansError" class="text-center">
                    <p v-if="starterPlan" class="text-sm text-gray-500">{{ starterPlan.tagline }}</p>
                    <p class="mt-1 text-xs text-gray-400">{{ t('subscription.pricing.starter-price') }}</p>
                    <span v-if="isFreemium" class="mt-2 inline-block text-sm font-medium text-gray-500">
                        {{ t('subscription.pricing.current-plan') }}
                    </span>
                    <button v-else type="button"
                        class="mt-2 text-sm font-medium text-primary hover:underline" @click="goToPortal">
                        {{ t('subscription.pricing.continue-free') }}
                    </button>
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

                <!-- Embedded Custom Checkout (localized price via Adaptive Pricing) -->
                <CheckoutPanel v-if="showCheckout && checkoutTier" :tier-id="checkoutTier" :cadence="cadence"
                    :plan-name="checkoutPlanName" @close="showCheckout = false" @success="onCheckoutSuccess" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Card, Button, Progress, Icon } from 'pilotui/elements';
import { SwitchBall } from 'pilotui/form';
import PageHeader from '~/components/common/PageHeader.vue';
import LimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
import CheckoutPanel from '~/components/subscription/CheckoutPanel.vue';

import { ref, computed } from 'vue';
import { functionProvider } from '@modular-rest/client';
import type { PublicTierPlan, Cadence, TierId } from '~/types/tiers';
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
const isLoadingPlans = ref(false);
const error = ref('');
const plansError = ref(false);
const plans = ref<PublicTierPlan[]>([]);

const isAnnual = ref(false);
const cadence = computed<Cadence>(() => (isAnnual.value ? 'annual' : 'monthly'));
const showCancelOffRamp = ref(false);

// Council 004: three paid cards (Reader / Learner / Coach) come from the backend;
// Starter is the "Continue with Free" link below them.
const paidPlans = computed(() => plans.value.filter((p) => p.isPaid));
const starterPlan = computed(() => plans.value.find((p) => !p.isPaid));

const activeSubscriptionData = computed(() => profileStore.activeSubscription);
const isFreemium = computed(() => profileStore.isFreemium);
const activePlanId = computed<TierId | undefined>(() => activeSubscriptionData.value?.tier);
const isTrialing = computed(() => activeSubscriptionData.value?.status === 'trialing');
const isCanceling = computed(() => !!activeSubscriptionData.value?.cancel_at_period_end);
const activePlanName = computed(() => activeSubscriptionData.value?.label || t('subscription.title'));

// Embedded Custom Checkout panel state (replaces the hosted redirect). The panel
// shows the localized price (EUR for EU visitors) via Stripe Adaptive Pricing.
const showCheckout = ref(false);
const checkoutTier = ref<TierId | null>(null);
const checkoutPlanName = ref('');

// GBP base price; Stripe Adaptive Pricing localizes the displayed currency at checkout.
function formatAmount(plan: PublicTierPlan, cad: Cadence): string {
    const amount = plan.pricing?.[cad]?.gbp;
    if (amount == null) return '';
    return `£${amount.toFixed(2)}`;
}

function formatDate(d: string | Date | undefined): string {
    return d ? new Date(d).toLocaleDateString() : '';
}

async function fetchPlans() {
    isLoadingPlans.value = true;
    plansError.value = false;
    try {
        plans.value = await functionProvider.run<PublicTierPlan[]>({
            name: 'getSubscriptionPlans',
            args: {},
        });
    } catch (err) {
        plansError.value = true;
        console.error('Failed to load subscription plans:', err);
    } finally {
        isLoadingPlans.value = false;
    }
}

onMounted(() => {
    fetchPlans();
});

// Open the embedded Custom Checkout panel for a paid tier at the selected cadence.
// The localized price (e.g. EUR) is shown in-panel via Stripe Adaptive Pricing —
// no redirect.
function initiateCheckout(tierId: TierId) {
    const plan = paidPlans.value.find((p) => p.id === tierId);
    checkoutTier.value = tierId;
    checkoutPlanName.value = plan?.name || '';
    error.value = '';
    analytic.track(ANALYTICS_EVENTS.TRIAL_STARTED, { cadence: cadence.value });
    showCheckout.value = true;
}

// After a successful in-panel payment: refresh the subscription and land on the
// success page (the webhook grants entitlements from metadata server-side).
async function onCheckoutSuccess() {
    showCheckout.value = false;
    try {
        await profileStore.fetchSubscription();
    } catch {
        /* ignore */
    }
    window.location.href = `${window.location.origin}/#/payment-success`;
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
