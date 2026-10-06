<template>
    <!-- Client-only by construction: consent is `undefined` in prerendered HTML, so the banner never
         ships in the page and, being fixed, never shifts it. Accept and Decline carry equal weight. -->
    <section v-if="enabled && consent === null" class="consent" aria-labelledby="consent-title">
        <h2 id="consent-title" class="consent__title">Can we use cookies?</h2>
        <p class="consent__text">
            We would like to measure how people use this page (Mixpanel) and how our ads perform (Google Ads). Nothing loads until you choose.
            <a href="/privacy">Privacy policy</a>
        </p>
        <div class="consent__actions">
            <StButton color="neutral" size="md" @click="choose('granted')">Accept</StButton>
            <StButton variant="outline" color="neutral" size="md" @click="choose('denied')">Decline</StButton>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';

    const { consent, enabled, choose } = useAnalytics();
</script>

<style scoped>
    .consent {
        position: fixed;
        z-index: var(--z-overlay);
        inset-inline: 12px;
        bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 26rem;
        padding: 18px 20px;
        border: 1px solid rgb(var(--border-subtle));
        border-radius: var(--radius-lg);
        background: rgb(var(--surface-card));
        box-shadow: var(--shadow-xl);
    }

    .consent__title {
        font-size: 1.0625rem;
        font-weight: 900;
    }

    .consent__text {
        font-size: 0.9375rem;
        line-height: 1.5;
    }

    .consent__actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 4px;
    }

    @media (min-width: 640px) {
        .consent {
            inset-inline: 20px auto;
            bottom: 20px;
        }
    }
</style>
