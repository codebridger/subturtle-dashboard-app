<template>
    <section id="pricing" class="section pricing" aria-labelledby="pricing-title">
        <div class="container pricing__inner">
            <div class="section-head section-head--center">
                <p class="eyebrow">Pricing</p>
                <h2 id="pricing-title" class="section-title">Start free. Upgrade when you want to speak more.</h2>
                <p class="lede">Smart Review is unlimited on every plan. Paid plans add more saves, chats and voice minutes.</p>
            </div>

            <div class="cadence" role="group" aria-label="Billing period">
                <button type="button" :aria-pressed="cadence === 'monthly'" @click="setCadence('monthly')">Monthly</button>
                <button type="button" :aria-pressed="cadence === 'annual'" @click="setCadence('annual')">
                    Yearly <span class="cadence__save">save 20%</span>
                </button>
            </div>

            <ul class="plans">
                <li v-for="plan in plans" :key="plan.id" class="plan" :class="{ 'plan--top': plan.highlight }">
                    <article class="plan__card" :aria-labelledby="`plan-${plan.id}`">
                        <div class="plan__head">
                            <h3 :id="`plan-${plan.id}`" class="plan__name">{{ plan.name }}</h3>
                            <StBadge v-if="plan.badge" color="primary" solid>{{ plan.badge }}</StBadge>
                        </div>
                        <p class="plan__price">
                            <template v-if="!plan.pricing">
                                <span class="plan__amount">Free</span>
                            </template>
                            <template v-else>
                                <span class="plan__amount">{{ gbp(price(plan)) }}</span>
                                <span class="plan__per">{{ cadence === 'annual' ? '/ year' : '/ month' }}</span>
                            </template>
                        </p>
                        <p class="plan__note">
                            <template v-if="!plan.pricing">No card needed.</template>
                            <template v-else-if="cadence === 'annual'">{{ gbp(price(plan) / 12) }} a month, billed yearly.</template>
                            <template v-else>Billed monthly. Cancel any time.</template>
                        </p>
                        <p class="plan__tagline">{{ plan.tagline }}</p>
                        <ul class="plan__features">
                            <li v-for="feature in plan.featureLabels" :key="feature">
                                <StIcon name="solar:check-circle-bold" :size="18" class="plan__tick" />
                                <span>{{ feature }}</span>
                            </li>
                        </ul>
                        <div class="plan__cta">
                            <StButton
                                :href="plan.isPaid ? dashboardHref('/settings/subscription?from=landing') : installHref"
                                :variant="plan.highlight ? 'solid' : 'outline'"
                                size="md"
                                block
                                @click="track('pricing-plan_clicked', { tier: plan.id, cadence })"
                            >
                                {{ ctaLabel(plan) }}
                            </StButton>
                            <p v-if="plan.trialDays" class="plan__trust">{{ plan.trialDays }}-day free trial. Card required. Cancel any time.</p>
                        </div>
                    </article>
                </li>
            </ul>

            <p class="pricing__foot">
                <StIcon name="solar:shield-check-bold-duotone" :size="20" />
                Prices are in GBP. At checkout you see and pay in your local currency. Payments are handled by Stripe.
            </p>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StBadge, StButton, StIcon } from 'subturtle-ui';
    // Build-time data from Stripe (see the #plans alias in nuxt.config.ts).
    import allPlans from '#plans';

    interface Plan {
        id: string;
        status: string;
        name: string;
        tagline: string;
        isPaid: boolean;
        featureLabels: string[];
        pricing: { monthly: { gbp?: number }; annual: { gbp?: number } } | null;
        highlight: boolean;
        badge: string | null;
        trialDays: number;
    }

    const plans = (allPlans as Plan[]).filter((p) => p.status === 'live');
    const cadence = ref<'monthly' | 'annual'>('monthly');
    const { installHref, dashboardHref } = useCta();

    const gbp = (n: number) => `£${n.toFixed(2)}`;
    const price = (plan: Plan) => plan.pricing?.[cadence.value]?.gbp ?? 0;

    function ctaLabel(plan: Plan) {
        if (!plan.isPaid) return 'Add to Chrome';
        if (plan.trialDays) return `Start ${plan.trialDays}-day free trial`;
        return `Choose ${plan.name}`;
    }

    function setCadence(value: 'monthly' | 'annual') {
        if (cadence.value === value) return;
        cadence.value = value;
        track('pricing-cadence_changed', { cadence: value });
    }
</script>

<style scoped>
    .pricing {
        background: linear-gradient(rgb(var(--rose-50) / 0), rgb(var(--rose-50) / 0.8) 25%, rgb(var(--rose-50) / 0.8) 75%, rgb(var(--rose-50) / 0));
    }

    .pricing__inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(1.75rem, 3.5vw, 2.5rem);
    }

    .cadence {
        display: inline-flex;
        padding: 4px;
        border-radius: var(--radius-pill);
        background: rgb(var(--ink-150));
    }

    .cadence button {
        min-height: 44px;
        padding: 6px 18px;
        border: 0;
        border-radius: var(--radius-pill);
        background: transparent;
        color: rgb(var(--ink-700));
        font-weight: 800;
        cursor: pointer;
    }

    .cadence button[aria-pressed='true'] {
        background: rgb(var(--white));
        color: rgb(var(--text-strong));
        box-shadow: var(--shadow-sm);
    }

    .cadence__save {
        margin-inline-start: 4px;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgb(var(--jade-100));
        color: rgb(var(--jade-700));
        font-size: 0.75rem;
    }

    .plans {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
        gap: 16px;
        width: 100%;
        padding: 0;
        list-style: none;
    }

    .plan {
        display: flex;
    }

    .plan__card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        padding: 26px 22px 22px;
        border-radius: var(--radius-lg);
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--surface-card));
        box-shadow: var(--shadow-sm);
    }

    .plan--top .plan__card {
        border: 2px solid rgb(var(--rose-600));
        box-shadow: var(--shadow-lg);
    }

    .plan__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 26px;
    }

    .plan__name {
        font-size: 1.25rem;
        font-weight: 900;
    }

    .plan__price {
        display: flex;
        align-items: baseline;
        gap: 6px;
    }

    .plan__amount {
        font-size: 2.375rem;
        font-weight: 900;
        letter-spacing: -0.02em;
        color: rgb(var(--text-strong));
        font-variant-numeric: tabular-nums;
    }

    .plan__per {
        font-weight: 700;
        color: rgb(var(--ink-600));
    }

    .plan__note {
        margin-top: -6px;
        font-size: 0.875rem;
        color: rgb(var(--ink-600));
    }

    .plan__tagline {
        font-weight: 700;
        color: rgb(var(--ink-800));
        line-height: 1.45;
    }

    .plan__features {
        display: flex;
        flex-direction: column;
        gap: 9px;
        margin-block: 6px 10px;
        padding: 0;
        list-style: none;
        font-size: 0.9375rem;
    }

    .plan__features li {
        display: flex;
        gap: 8px;
        line-height: 1.4;
    }

    .plan__tick {
        flex-shrink: 0;
        margin-top: 1px;
        color: rgb(var(--jade-600));
    }

    .plan__cta {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: auto;
    }

    .plan__trust {
        font-size: 0.8125rem;
        color: rgb(var(--ink-600));
        text-align: center;
    }

    .pricing__foot {
        max-width: 40rem;
        font-size: 0.9375rem;
        color: rgb(var(--ink-600));
        text-align: center;
    }

    .pricing__foot :deep(svg) {
        margin-inline-end: 6px;
        vertical-align: -4px;
        color: rgb(var(--jade-600));
    }

    /* Phones: the plan most people pick comes first. */
    @media (max-width: 559px) {
        .plan--top {
            order: -1;
        }
    }
</style>
