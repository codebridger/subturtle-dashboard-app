<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader :title="t('subscription.subscription-plans')" :overline="t('subscription.overline')">
            <template v-if="showPlans" #actions>
                <StSwitch v-model="isAnnual" :label="t('subscription.pricing.annual-toggle')" />
            </template>
        </StPageHeader>

        <!-- Loading: skeletons in the shape of the strip / tabs / detail panel, so the
             layout doesn't jump when the plans land. -->
        <template v-if="isLoadingPlans">
            <StSkeleton class="h-[88px]" />
            <div class="grid grid-cols-2 gap-[10px] md:grid-cols-4">
                <StSkeleton v-for="n in 4" :key="n" class="h-[70px]" />
            </div>
            <StSkeleton class="h-[300px]" />
        </template>

        <StCard v-else-if="plansError" padding="none">
            <StEmptyState
                icon="solar:danger-triangle-bold"
                color="neutral"
                :title="t('subscription.pricing.error-title')"
                :description="t('subscription.pricing.error')"
            />
        </StCard>

        <StCard v-else-if="!paidPlans.length" padding="none">
            <StEmptyState icon="solar:crown-bold" :title="t('subscription.pricing.empty-title')" :description="t('subscription.pricing.empty')" />
        </StCard>

        <template v-else>
            <!-- The plan is not known until getSubscriptionDetails lands, and the strip's
                 defaults (Starter, no allowances) would otherwise render as a real answer
                 for a moment. -->
            <StSkeleton v-if="isSubscriptionFetching" class="h-[88px]" />

            <!-- Current plan + this period's usage. One strip for every tier: the free
                 caps and the paid allowances read from different stores but render the
                 same, so there is no separate Starter card any more. -->
            <div
                v-else
                class="flex flex-wrap items-center justify-between gap-6 rounded-st-lg border border-st-line bg-st-card px-[22px] py-[15px] shadow-st-sm"
            >
                <div>
                    <div class="flex items-center gap-[9px]">
                        <span class="text-st-sm font-extrabold text-st-strong">{{ currentPlanName }}</span>
                        <StBadge :color="statusBadge.color">{{ statusBadge.label }}</StBadge>
                    </div>
                    <p class="mt-1 text-st-xs font-bold text-st-faint">{{ currentPlanNote }}</p>
                </div>

                <div class="flex flex-wrap items-center gap-[22px]">
                    <div v-for="meter in usageMeters" :key="meter.label" class="min-w-[112px]">
                        <div class="mb-1.5 flex items-baseline justify-between gap-[10px]">
                            <span class="text-st-xs font-bold text-st-body">{{ meter.label }}</span>
                            <button
                                v-if="meter.upsell"
                                type="button"
                                class="st-focus-ring rounded-st-sm text-st-xs font-bold text-st-link hover:underline"
                                @click="selectUpgradeTier"
                            >
                                {{ meter.value }}
                            </button>
                            <span v-else class="text-st-xs font-bold" :class="meter.unlimited ? 'text-st-jade-700' : 'text-st-faint'">{{ meter.value }}</span>
                        </div>
                        <!-- An unlimited allowance gets an empty accent-tinted track rather
                             than a filled one: a full bar reads as "you are at your cap",
                             which is the opposite of what unlimited means. The upsell row has
                             no budget to plot at all. -->
                        <div class="h-[6px] overflow-hidden rounded-st-pill" :class="meter.unlimited || meter.upsell ? 'bg-st-accent-soft' : 'bg-st-ink-150'">
                            <div
                                v-if="!meter.unlimited && !meter.upsell"
                                class="h-full rounded-st-pill transition-all duration-500"
                                :class="meter.fill"
                                :style="{ width: `${meter.pct}%` }"
                            />
                        </div>
                    </div>

                    <StButton v-if="showTopUp" variant="ghost" color="primary" size="sm" @click="goToTopUps">
                        {{ t('subscription.voice-meter.top-up') }}
                    </StButton>
                </div>
            </div>

            <!-- Plan picker. A tablist rather than four standalone cards: the detail panel
                 below is the selected tab's panel. -->
            <div role="tablist" :aria-label="t('subscription.subscription-plans')" class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[10px]">
                <button
                    v-for="plan in plans"
                    :id="`plan-tab-${plan.id}`"
                    :key="plan.id"
                    type="button"
                    role="tab"
                    :aria-selected="plan.id === selectedId"
                    :aria-controls="`plan-panel-${plan.id}`"
                    class="st-focus-ring flex cursor-pointer flex-col items-start gap-[5px] rounded-st-lg px-4 py-[14px] text-left transition-all duration-200"
                    :class="
                        plan.id === selectedId
                            ? 'border-2 border-st-primary bg-st-card shadow-st-md'
                            : 'border-[1.5px] border-st-ink-200 bg-transparent hover:border-st-ink-300'
                    "
                    @click="selectedId = plan.id"
                >
                    <span
                        class="flex flex-wrap items-center gap-[7px] text-st-md font-black"
                        :class="plan.id === selectedId ? 'text-st-strong' : 'text-st-muted'"
                    >
                        {{ plan.name }}
                        <!-- Ribbon text comes from Stripe metadata (e.g. "Most popular"); the
                             i18n string is only the fallback for a highlighted tier with none. -->
                        <StBadge v-if="plan.badge || plan.highlight" color="primary" solid>
                            {{ plan.badge || t('subscription.pricing.popular') }}
                        </StBadge>
                        <StBadge v-else-if="plan.id === currentTierId">{{ t('subscription.pricing.current') }}</StBadge>
                    </span>
                    <span class="text-st-xs font-bold" :class="plan.id === selectedId ? 'text-st-muted' : 'text-st-faint'">{{ pricePeriod(plan) }}</span>
                </button>
            </div>

            <!-- Selected plan: price + CTA on a sunken rail, features alongside. -->
            <div
                v-if="selectedPlan"
                :id="`plan-panel-${selectedPlan.id}`"
                role="tabpanel"
                :aria-labelledby="`plan-tab-${selectedPlan.id}`"
                class="grid grid-cols-1 overflow-hidden rounded-st-xl border border-st-line bg-st-card shadow-st-md md:grid-cols-[minmax(280px,330px)_minmax(0,1fr)]"
            >
                <!-- `bg-st-sunken`, not the design's --ink-50: the ink ramp inverts in dark,
                     where ink-50 lands within one channel step of --surface-card and the rail
                     disappears. --surface-sunken is the token that keeps the role in both. -->
                <div class="flex flex-col gap-4 bg-st-sunken p-7">
                    <div>
                        <h2 class="font-st-display text-st-xl font-black tracking-st-tight text-st-strong">{{ selectedPlan.name }}</h2>
                        <p class="mt-[7px] text-st-sm font-semibold leading-normal text-st-muted [text-wrap:pretty]">{{ selectedPlan.tagline }}</p>
                    </div>

                    <div v-if="selectedPlan.isPaid && isProbingCurrency" class="flex flex-col gap-2">
                        <StSkeleton class="h-9 w-32" />
                        <StSkeleton class="h-3 w-24" />
                    </div>
                    <template v-else>
                        <div class="flex items-baseline gap-[5px]">
                            <span class="font-st-display text-st-3xl font-black tracking-[-0.04em] text-st-strong">{{ price(selectedPlan) }}</span>
                            <span v-if="selectedPlan.isPaid" class="text-st-sm font-bold text-st-muted">/ {{ periodLabel }}</span>
                        </div>
                        <span class="text-st-xs font-bold text-st-faint">{{ priceNote(selectedPlan) }}</span>
                    </template>

                    <div class="mt-auto flex flex-col gap-[9px]">
                        <StButton :variant="cta.variant" :color="cta.color" size="lg" block :disabled="cta.disabled || isOpeningChangePlan" @click="cta.action">
                            {{ cta.label }}
                        </StButton>
                        <span v-if="cta.note" class="text-center text-st-xs font-bold leading-[1.4] text-st-faint">{{ cta.note }}</span>
                    </div>
                </div>

                <div class="px-[30px] py-7">
                    <h3 class="mb-[18px] text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('subscription.features') }}</h3>
                    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-x-[26px] gap-y-[13px]">
                        <div
                            v-for="feature in selectedPlan.featureLabels"
                            :key="feature"
                            class="flex items-start gap-[10px] text-st-md font-semibold text-st-body"
                        >
                            <StIcon name="solar:check-circle-bold" :size="19" class="mt-0.5 flex-none text-st-accent" />
                            <span>{{ feature }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <p class="text-st-xs font-semibold text-st-faint">{{ t('subscription.pricing.footnote') }}</p>
        </template>

        <p v-if="error" class="rounded-st-md bg-st-danger-soft px-4 py-3 text-st-sm font-semibold text-st-red-600">{{ error }}</p>

        <!-- Internal metering + profile reset. Dev builds only. -->
        <StCard v-if="config.public.isNotProduction" padding="lg" class="flex flex-col gap-6">
            <template v-if="activeSubscriptionData">
                <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">AI usage — internal metering (dev only)</h2>
                <div class="overflow-x-auto">
                    <table class="w-full table-auto border-collapse text-st-sm">
                        <thead>
                            <tr class="border-b border-st-line">
                                <th class="px-4 py-2 text-left font-bold text-st-body">{{ t('subscription.metric') }}</th>
                                <th class="px-4 py-2 text-left font-bold text-st-body">Internal units</th>
                                <th class="px-4 py-2 text-left font-bold text-st-body">USD</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in devCreditRows" :key="row.label" class="border-b border-st-line last:border-0">
                                <td class="px-4 py-2 font-semibold text-st-muted">{{ row.label }}</td>
                                <td class="px-4 py-2 font-semibold text-st-muted">{{ row.units }}</td>
                                <td class="px-4 py-2 font-semibold text-st-muted">{{ row.usd }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>

            <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 class="text-st-md font-black text-st-strong">Profile Reset</h3>
                    <p class="mt-1 text-st-sm font-semibold text-st-muted">
                        Clear all subscription and freemium data for testing purposes. This action cannot be undone.
                    </p>
                </div>
                <StButton color="danger" :disabled="isResetLoading" @click="handleProfileReset">Reset Profile</StButton>
            </div>
        </StCard>

        <!-- Cancel-trial off-ramp interstitial (shown before the Stripe portal). Still
             pilotui: LimitationModal is shared with the layout's global tier-limit modal,
             so it migrates with that surface, not with this screen. -->
        <LimitationModal
            v-model="showCancelOffRamp"
            :modal-title="t('subscription.cancel-offramp.title')"
            :main-message="t('subscription.cancel-offramp.message')"
            :sub-message="t('subscription.cancel-offramp.sub-message')"
            icon-name="IconLockDots"
            :primary-button-label="t('subscription.cancel-offramp.stay')"
            :secondary-button-label="t('subscription.cancel-offramp.continue')"
            :auto-redirect-on-upgrade="false"
            @secondary="goToPortal"
        />

        <!-- Embedded Custom Checkout (localized price via Adaptive Pricing) -->
        <CheckoutPanel
            v-if="showCheckout && checkoutTier"
            :tier-id="checkoutTier"
            :cadence="cadence"
            :plan-name="checkoutPlanName"
            @close="showCheckout = false"
            @success="onCheckoutSuccess"
        />
    </div>
</template>

<script setup lang="ts">
    import { ref, computed } from 'vue';
    import { loadStripe } from '@stripe/stripe-js';
    import { functionProvider } from '@modular-rest/client';
    import { StBadge, StButton, StCard, StEmptyState, StIcon, StSkeleton, StSwitch } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import LimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
    import CheckoutPanel from '~/components/subscription/CheckoutPanel.vue';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';
    import type { PublicTierPlan, Cadence, TierId } from '~/types/tiers';
    import { useProfileStore } from '~/stores/profile';
    import { analytic } from '~/plugins/mixpanel';
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';

    const { t } = useI18n();
    const route = useRoute();
    const config = useRuntimeConfig();
    const profileStore = useProfileStore();

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.subscription-plans'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const isResetLoading = ref(false);
    const isLoadingPlans = ref(false);
    const error = ref('');
    const plansError = ref(false);
    const plans = ref<PublicTierPlan[]>([]);

    const isAnnual = ref(false);
    const cadence = computed<Cadence>(() => (isAnnual.value ? 'annual' : 'monthly'));
    const showCancelOffRamp = ref(false);

    // Council 004: the paid tiers (Reader / Learner / Coach) come from the backend;
    // Starter is the free tier the picker also lists.
    const paidPlans = computed(() => plans.value.filter((p) => p.isPaid));
    const showPlans = computed(() => !isLoadingPlans.value && !plansError.value && paidPlans.value.length > 0);

    const activeSubscriptionData = computed(() => profileStore.activeSubscription);
    const isFreemium = computed(() => profileStore.isFreemium);
    const isSubscriptionFetching = computed(() => profileStore.isSubscriptionFetching);
    const isTrialing = computed(() => activeSubscriptionData.value?.status === 'trialing');
    const isCanceling = computed(() => !!activeSubscriptionData.value?.cancel_at_period_end);

    // The tier the user is on right now — 'starter' covers both a free account and one
    // whose paid subscription has lapsed.
    const currentTierId = computed<TierId>(() => (isFreemium.value ? 'starter' : (activeSubscriptionData.value?.tier as TierId) ?? 'starter'));
    const currentPlanName = computed(() => {
        if (!isFreemium.value && activeSubscriptionData.value?.label) return activeSubscriptionData.value.label;
        return plans.value.find((p) => p.id === currentTierId.value)?.name ?? t('subscription.pricing.free-plan');
    });

    const { base: voiceBase, used: voiceUsed, topUps: voiceTopUps, topUpRemaining: voiceTopUpRemaining } = useVoiceBalance();

    // Reader grants no voice minutes, so an untouched Reader has no voice budget at all.
    // "0 / 0" is a dead end, so that one meter becomes the upsell instead (Council 004).
    const voiceLocked = computed(() => !isFreemium.value && voiceBase.value === 0 && voiceTopUpRemaining.value === 0);

    /* ---- Plan picker ------------------------------------------------------ */

    // Chosen once the plans land: an explicit ?suggest= (the tier-limit modal deep-links
    // with it) beats the highlighted tier, which beats the plan the user is already on.
    // Highlighted-over-current is the design's own default and the point of the screen —
    // opening a free user on Starter would show them what they already have.
    const selectedId = ref<TierId | null>(null);
    const selectedPlan = computed(() => plans.value.find((p) => p.id === selectedId.value) ?? plans.value[0] ?? null);

    function pickInitialPlan() {
        const suggested = route.query.suggest as TierId | undefined;
        const has = (id?: string | null) => !!id && plans.value.some((p) => p.id === id);
        if (has(suggested)) selectedId.value = suggested!;
        else selectedId.value = (plans.value.find((p) => p.highlight)?.id ?? (has(currentTierId.value) ? currentTierId.value : plans.value[0]?.id)) as TierId;
    }

    const periodLabel = computed(() => (isAnnual.value ? t('subscription.pricing.year') : t('subscription.pricing.month')));

    function price(plan: PublicTierPlan): string {
        return plan.isPaid ? formatAmount(plan, cadence.value) : t('subscription.pricing.free');
    }

    function pricePeriod(plan: PublicTierPlan): string {
        return plan.isPaid ? `${formatAmount(plan, cadence.value)} / ${periodLabel.value}` : t('subscription.pricing.free');
    }

    function priceNote(plan: PublicTierPlan): string {
        if (!plan.isPaid) return t('subscription.pricing.starter-price');
        return isAnnual.value ? t('subscription.pricing.billed-yearly') : t('subscription.pricing.billed-monthly');
    }

    /* ---- Current plan strip ----------------------------------------------- */

    const statusBadge = computed<{ label: string; color: 'neutral' | 'primary' | 'warning' }>(() => {
        if (isCanceling.value) return { label: t('subscription.pricing.canceling'), color: 'warning' };
        if (isTrialing.value) return { label: t('subscription.pricing.trial'), color: 'primary' };
        return { label: t('subscription.pricing.current'), color: 'neutral' };
    });

    // "Resets on 12 June." — the active period's end, for free and paid alike.
    const resetsOn = computed(() => {
        const d = isFreemium.value ? (profileStore.freemiumAllocation as any)?.end_date : activeSubscriptionData.value?.end_date;
        if (!d) return '';
        try {
            return t('subscription.voice-meter.resets', { date: new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) });
        } catch {
            return '';
        }
    });

    // One tiny line under the plan name: what the plan is (or what is about to happen to
    // it), then when the allowances reset.
    const currentPlanNote = computed(() => {
        let status: string;
        if (isFreemium.value) status = t('subscription.pricing.starter-price');
        else if (isCanceling.value) status = t('subscription.canceling', { date: formatDate(activeSubscriptionData.value?.end_date) });
        else if (isTrialing.value) status = t('subscription.trial-active', { days: activeSubscriptionData.value?.remaining_days ?? 0 });
        else status = `${t('subscription.started-at')} ${formatDate(activeSubscriptionData.value?.start_date)}`;
        return [status, isCanceling.value ? '' : resetsOn.value].filter(Boolean).join(' ');
    });

    // Free-tier caps (mirror server/src/config.ts). Only a fallback: a legacy free_credit
    // doc can predate a field, and on the free tier a missing cap must never render as
    // "Unlimited" — that would promise something the tier does not give.
    const FREE_CAPS = { saveWords: 200, textChats: 5, liveSessions: 3, voice: 5 };

    /**
     * The four allowances this period, in the same shape for every tier. On a paid plan a
     * null/absent cap genuinely means unlimited (e.g. a Learner's text chats); on the free
     * plan it falls back to the known cap instead.
     */
    const usageMeters = computed(() => {
        const free = isFreemium.value;
        const src: any = (free ? profileStore.freemiumAllocation : activeSubscriptionData.value) ?? {};
        const cap = (value: number | null | undefined, fallback: number) => (free ? value ?? fallback : value);
        const rows = [
            {
                label: t('subscription.starter-usage.saved-phrases'),
                limit: cap(src.allowed_save_words, FREE_CAPS.saveWords),
                used: src.allowed_save_words_used,
            },
            { label: t('subscription.starter-usage.text-chats'), limit: cap(src.allowed_text_chats, FREE_CAPS.textChats), used: src.allowed_text_chats_used },
            {
                label: t('subscription.starter-usage.live-sessions'),
                limit: cap(src.allowed_lived_sessions, FREE_CAPS.liveSessions),
                used: src.allowed_lived_sessions_used,
            },
            // Top-up packs are spendable now, so they belong in the voice total rather
            // than in a separate line the strip has no room for.
            {
                label: t('subscription.starter-usage.voice'),
                limit: cap(voiceBase.value + voiceTopUpRemaining.value, FREE_CAPS.voice),
                used: voiceUsed.value,
                upsell: voiceLocked.value,
            },
        ];

        return rows.map((row) => {
            const unlimited = row.limit == null;
            const used = row.used ?? 0;
            const limit = row.limit ?? 0;
            const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            // Rose is the design's resting fill; the amber/red steps are the cap warning
            // Council 004 specced, which the prototype's all-zero demo never shows.
            const fill = pct >= 100 ? 'bg-st-danger' : pct >= 80 ? 'bg-st-warning' : 'bg-st-primary';
            const value = row.upsell ? t('subscription.this-month.upgrade-learner') : unlimited ? t('subscription.this-month.unlimited') : `${used} / ${limit}`;
            return { label: row.label, unlimited, upsell: !!row.upsell, pct, fill, value };
        });
    });

    // The voice meter's own top-up entry point (it used to live inside VoiceMeter, which
    // this screen no longer renders). Paid tiers only — Starter cannot buy minutes.
    const showTopUp = computed(() => !isFreemium.value && (voiceBase.value > 0 || voiceTopUps.value.length > 0));

    function goToTopUps() {
        navigateTo('/settings/billing');
    }

    // The voice upsell selects the tier that actually grants voice rather than leaving
    // the page, so the user lands on its price and features in the panel below.
    function selectUpgradeTier() {
        const target = plans.value.find((p) => p.id === 'learner') ?? plans.value.find((p) => p.highlight);
        if (target) selectedId.value = target.id;
    }

    /* ---- The one CTA ------------------------------------------------------ */

    type Cta = { label: string; variant: 'solid' | 'outline'; color: 'primary' | 'neutral'; disabled?: boolean; note?: string; action: () => void };

    const cta = computed<Cta>(() => {
        const plan = selectedPlan.value;
        if (!plan) return { label: '', variant: 'outline', color: 'neutral', disabled: true, action: () => {} };

        // The plan they are already on. Free has nothing to manage; a paid plan opens the portal.
        if (plan.id === currentTierId.value) {
            return isFreemium.value
                ? { label: t('subscription.pricing.current-plan'), variant: 'outline', color: 'neutral', disabled: true, action: () => {} }
                : { label: t('subscription.manage-subscription'), variant: 'outline', color: 'neutral', action: manageSubscription };
        }

        // A paid user looking at Starter: cancelling is what reverts them to free.
        if (!plan.isPaid) return { label: t('subscription.pricing.downgrade-free'), variant: 'outline', color: 'primary', action: downgradeToFree };

        // Already paying for a different tier — switch in the portal, where Stripe prorates.
        // Starting a checkout here would stack a second subscription.
        if (!isFreemium.value) return { label: t('subscription.pricing.change-plan'), variant: 'outline', color: 'primary', action: goToChangePlan };

        const variant = plan.highlight ? 'solid' : 'outline';
        if (plan.trialDays > 0) {
            return {
                label: t('subscription.pricing.trial-cta', { days: plan.trialDays }),
                variant,
                color: 'primary',
                note: t('subscription.pricing.trial-subline', { days: plan.trialDays }),
                action: () => initiateCheckout(plan.id),
            };
        }
        return { label: t('subscription.pricing.choose-plan', { name: plan.name }), variant, color: 'primary', action: () => initiateCheckout(plan.id) };
    });

    /* ---- Dev-only metering ------------------------------------------------ */

    const devCreditRows = computed(() => {
        const s: any = activeSubscriptionData.value;
        if (!s) return [];
        return [
            { label: t('subscription.total'), units: s.total_credits, usd: s.total_credit_in_usd },
            { label: t('subscription.available'), units: s.available_credit, usd: `$${s.available_credit_in_usd}` },
            { label: t('subscription.used'), units: s.credits_used, usd: `$${s.used_credit_in_usd}` },
        ];
    });

    /* ---- Checkout + pricing (unchanged behaviour) ------------------------- */

    const showCheckout = ref(false);
    const checkoutTier = ref<TierId | null>(null);
    const checkoutPlanName = ref('');

    // Adaptive Pricing: probe the visitor's local currency + GBP conversion rate once
    // (via one Stripe session), then display the prices in that currency. Falls back
    // to the GBP base when unavailable / not localized.
    const localCurrency = ref<string | null>(null);
    const fxRate = ref<number | null>(null);

    // True only while the local currency is being probed over the network (cache
    // miss). Drives the price skeleton so the GBP base price doesn't flash before
    // the localized one arrives. Stays false for cache hits and when there is no
    // publishable key — those resolve to a price synchronously, no skeleton needed.
    const isProbingCurrency = ref(false);

    // Display the price in the visitor's local currency (e.g. EUR) when Adaptive
    // Pricing localizes it; otherwise the GBP base price.
    function formatAmount(plan: PublicTierPlan, cad: Cadence): string {
        const gbp = plan.pricing?.[cad]?.gbp;
        if (gbp == null) return '';
        if (localCurrency.value && fxRate.value) {
            try {
                return new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: localCurrency.value,
                }).format(gbp * fxRate.value);
            } catch {
                /* unknown currency code — fall through to GBP */
            }
        }
        return `£${gbp.toFixed(2)}`;
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
            pickInitialPlan();
        } catch (err) {
            plansError.value = true;
            console.error('Failed to load subscription plans:', err);
        } finally {
            isLoadingPlans.value = false;
        }
    }

    // Probe the visitor's local currency + conversion rate via one Stripe Checkout
    // Elements session (the only client-side way Stripe exposes the localized amount).
    // Cached per browser session so it costs one session, not one per page load.
    async function probeLocalCurrency() {
        const pk = config.public.STRIPE_PUBLISHABLE_KEY as string | undefined;
        if (!pk) return;
        // Paid users can't open a new checkout (the backend blocks stacking), so this
        // probe — which works by creating a checkout session — would just fail for them.
        // They change plans via the portal; the prices show the GBP base.
        if (!isFreemium.value) return;
        try {
            const cached = sessionStorage.getItem('subturtle.localPricing');
            if (cached) {
                const c = JSON.parse(cached);
                if (c.currency && c.fxRate) {
                    localCurrency.value = c.currency;
                    fxRate.value = c.fxRate;
                    return;
                }
            }
        } catch {
            /* ignore */
        }
        const probe = paidPlans.value.find((p) => p.id === 'reader') || paidPlans.value[0];
        const gbp = probe?.pricing?.monthly?.gbp;
        if (!probe || gbp == null) return;
        isProbingCurrency.value = true;
        try {
            const { clientSecret } = await functionProvider.run<{ clientSecret: string }>({
                name: 'createCustomCheckoutSession',
                args: {
                    tierId: probe.id,
                    cadence: 'monthly',
                    userId: profileStore.authUser?.id,
                    successUrl: `${window.location.origin}/#/payment-success`,
                },
            });
            const stripe = await loadStripe(pk);
            if (!stripe) return;
            const sdk = (stripe as any).initCheckoutElementsSdk({ clientSecret, adaptivePricing: { allowed: true } });
            const res = await sdk.loadActions();
            if (res.type !== 'success') return;
            const session = res.actions.getSession();
            // Only localize when Stripe actually presents a non-GBP currency.
            if (!session.currency || session.currency === 'gbp') return;
            // Prefer Stripe's TRUE conversion rate (currencyOptions[].currencyConversion.fxRate)
            // so every price matches checkout exactly; deriving a rate from one tier's
            // already-rounded amount drifts by a cent. Fall back to that derivation.
            const opt = (session.currencyOptions || []).find((o: any) => o?.currencyConversion?.fxRate);
            const minor = session?.lineItems?.[0]?.unitAmount?.minorUnitsAmount;
            const rate = opt ? parseFloat(opt.currencyConversion.fxRate) : minor ? minor / (gbp * 100) : null;
            if (!rate) return;
            localCurrency.value = session.currency;
            fxRate.value = rate;
            try {
                sessionStorage.setItem('subturtle.localPricing', JSON.stringify({ currency: session.currency, fxRate: rate }));
            } catch {
                /* ignore */
            }
        } catch (err) {
            console.error('Local pricing probe failed (showing GBP):', err);
        } finally {
            isProbingCurrency.value = false;
        }
    }

    onMounted(async () => {
        // Trial-to-paid funnel entry. The auto page-view can't carry attribution, so
        // fire an explicit event with the surface the user arrived from (?from=...);
        // default to 'settings' for direct/nav visits. Analytics is best-effort: when
        // Mixpanel is not initialised (e.g. no token in CI/e2e), track() can throw —
        // it must never abort the mount and block the plans from loading.
        try {
            analytic.track(ANALYTICS_EVENTS.PRICING_PAGE_VIEWED, {
                from_surface: (route.query.from as string) || 'settings',
            });
        } catch (e) {
            console.error('Failed to track pricing-page_viewed:', e);
        }
        await fetchPlans();
        probeLocalCurrency();
        // Returning from a portal plan change (?plan_changed=1): the
        // customer.subscription.updated webhook is async, so refetch a few times to
        // surface the new plan without a manual reload.
        if (route.query.plan_changed) pollForPlanChange();
    });

    async function pollForPlanChange() {
        for (let i = 0; i < 6; i++) {
            try {
                await profileStore.fetchSubscription();
            } catch {
                /* ignore */
            }
            if (i < 5) await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    }

    // Open the embedded Custom Checkout panel for a paid tier at the selected cadence.
    // The localized price (e.g. EUR) is shown in-panel via Stripe Adaptive Pricing —
    // no redirect.
    function initiateCheckout(tierId: TierId) {
        const plan = paidPlans.value.find((p) => p.id === tierId);
        checkoutTier.value = tierId;
        checkoutPlanName.value = plan?.name || '';
        error.value = '';
        analytic.track(ANALYTICS_EVENTS.CHECKOUT_OPENED, {
            tier: tierId,
            cadence: cadence.value,
            currency: localCurrency.value || 'GBP',
        });
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
    // and cancellation all live there rather than being reimplemented in-app. The
    // off-ramp interstitial's "continue" calls THIS, so it must never re-open the
    // interstitial; `manageSubscription` owns that branch.
    function goToPortal() {
        const url = activeSubscriptionData.value?.portal_url;
        if (url) window.location.href = url;
    }

    // Trialing users get the retention interstitial before the portal; everyone else
    // goes straight there.
    function manageSubscription() {
        if (isTrialing.value) showCancelOffRamp.value = true;
        else goToPortal();
    }

    // "Change plan": deep-link straight to the portal's plan picker (Stripe
    // flow_data.subscription_update) so the user lands on the tier selection rather
    // than the portal home. Falls back to the portal home if the deep link fails.
    const isOpeningChangePlan = ref(false);
    async function goToChangePlan() {
        isOpeningChangePlan.value = true;
        try {
            const { url } = await functionProvider.run<{ url: string }>({
                name: 'createPortalUpdateSession',
                args: { userId: profileStore.authUser?.id },
            });
            if (url) {
                window.location.href = url;
                return;
            }
            goToPortal();
        } catch {
            goToPortal();
        } finally {
            isOpeningChangePlan.value = false;
        }
    }

    // "Downgrade to Free": reuse the existing cancel flow — the off-ramp interstitial
    // for trialing users, the Stripe billing portal for active paid users (where the
    // cancellation that reverts them to Starter is confirmed).
    function downgradeToFree() {
        manageSubscription();
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
