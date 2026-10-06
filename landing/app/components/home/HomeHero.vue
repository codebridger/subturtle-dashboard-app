<template>
    <section class="hero" aria-labelledby="hero-title">
        <div class="container hero__grid">
            <div class="hero__copy">
                <!-- Swapped, not inserted, for Product Hunt visitors: same slot and both one line on a phone, so
                     nothing below moves. -->
                <p class="hero__eyebrow" :class="{ 'hero__eyebrow--ph': isProductHunt }">
                    <template v-if="isProductHunt">Hi, Product Hunt 👋 Starter is free.</template>
                    <template v-else>Chrome · Web pages, YouTube, Netflix</template>
                </p>
                <h1 id="hero-title" class="hero__title">From watching English to <span class="hl hl--brand">speaking it.</span></h1>
                <p class="lede hero__lede">
                    Select text on any web page, or hover a line in YouTube and Netflix captions, and see what it means in your language. Subturtle saves the
                    phrase with where you found it, brings it back at the right time, and lets you practice it out loud with an AI voice coach.
                </p>
                <div id="hero-cta" class="hero__ctas">
                    <StButton :href="installHref" size="lg" icon="solar:add-circle-bold" @click="track('install-cta_clicked', { location: 'hero' })">
                        Add to Chrome, it's free
                    </StButton>
                    <StButton
                        :href="dashboardHref('/')"
                        size="lg"
                        variant="outline"
                        color="neutral"
                        icon-right="solar:arrow-right-linear"
                        @click="track('dashboard-cta_clicked', { location: 'hero' })"
                    >
                        Open dashboard
                    </StButton>
                </div>
                <p class="hero__micro">Free to start. No card needed.</p>
                <div class="hero__proof">
                    <a :href="CHROME_WEB_STORE_URL" class="rating">
                        <span class="rating__stars" aria-hidden="true">
                            <StIcon v-for="n in 5" :key="n" name="solar:star-bold" :size="16" />
                        </span>
                        <span
                            ><strong>{{ STORE_RATING.value }}</strong> from {{ STORE_RATING.count }} ratings on the Chrome Web Store</span
                        >
                    </a>
                    <StBadge color="accent" icon="solar:verified-check-bold">Featured</StBadge>
                </div>
            </div>
            <HomeHeroDemo class="hero__demo" />
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StBadge, StButton, StIcon } from 'subturtle-ui';
    import { CHROME_WEB_STORE_URL, STORE_RATING } from '~/data/site';

    const { installHref, dashboardHref, isProductHunt } = useCta();
</script>

<style scoped>
    .hero {
        position: relative;
        padding-block: clamp(2.5rem, 6vw, 5rem) clamp(4rem, 8vw, 6rem);
        overflow: hidden;
    }

    /* The design system's ambient blobs: rose and jade tints, decoration only. */
    .hero::before {
        content: '';
        position: absolute;
        inset: -20% -10% auto auto;
        width: 60vw;
        max-width: 760px;
        aspect-ratio: 1;
        z-index: -1;
        /* closest-side keeps each fade inside the box, so no edge of it ever shows. */
        background:
            radial-gradient(closest-side at 60% 40%, rgb(var(--rose-500) / 0.13), transparent),
            radial-gradient(closest-side at 25% 75%, rgb(var(--jade-500) / 0.1), transparent);
    }

    .hero__grid {
        display: grid;
        gap: clamp(2.5rem, 5vw, 4rem);
        align-items: center;
    }

    .hero__copy {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 20px;
        min-width: 0;
    }

    .hero__eyebrow {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 4px 14px;
        border-radius: var(--radius-pill);
        background: rgb(var(--surface-card));
        border: 1px solid rgb(var(--border-subtle));
        font-size: 0.875rem;
        font-weight: 800;
        color: rgb(var(--ink-700));
    }

    .hero__eyebrow--ph {
        background: rgb(var(--rose-50));
        border-color: rgb(var(--rose-200));
        color: rgb(var(--rose-700));
    }

    .hero__title {
        font-size: clamp(2.375rem, 6.4vw, 4.25rem);
        font-weight: 900;
        line-height: 1.08;
        letter-spacing: -0.025em;
    }

    .hero__lede {
        max-width: 36rem;
    }

    .hero__ctas {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 4px;
    }

    .hero__micro {
        margin-top: -6px;
        font-size: 0.9375rem;
        font-weight: 700;
        color: rgb(var(--ink-600));
    }

    .hero__proof {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 14px;
    }

    .rating {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        color: rgb(var(--ink-700));
        font-size: 0.9375rem;
        text-decoration: none;
    }

    .rating:hover {
        text-decoration: underline;
    }

    .rating strong {
        color: rgb(var(--text-strong));
    }

    .rating__stars {
        display: inline-flex;
        color: rgb(var(--amber-500));
    }

    @media (max-width: 479px) {
        .hero__ctas > :deep(*) {
            width: 100%;
        }
    }

    @media (min-width: 1024px) {
        .hero__grid {
            grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr);
        }
    }
</style>
