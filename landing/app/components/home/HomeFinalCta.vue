<template>
    <section class="section final" aria-labelledby="final-title">
        <div class="container">
            <div class="panel">
                <SiteMark :size="56" />
                <h2 id="final-title" class="final__title">From watching English to <span class="hl">speaking it.</span></h2>
                <p class="lede final__lede">Add Subturtle to Chrome and save your first phrase today, from a page you read or a show you watch.</p>
                <div class="final__ctas">
                    <StButton :href="installHref" size="lg" icon="solar:add-circle-bold" @click="track('install-cta_clicked', { location: 'final' })">
                        Add to Chrome, it's free
                    </StButton>
                    <StButton
                        :href="dashboardHref('/')"
                        size="lg"
                        variant="ghost"
                        color="neutral"
                        icon-right="solar:arrow-right-linear"
                        @click="track('dashboard-cta_clicked', { location: 'final' })"
                    >
                        Open dashboard
                    </StButton>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';

    const { installHref, dashboardHref } = useCta();
</script>

<style scoped>
    .panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        padding: clamp(2.5rem, 7vw, 4.5rem) clamp(1.25rem, 5vw, 3rem);
        border-radius: var(--radius-2xl);
        background: radial-gradient(80% 90% at 50% 0%, rgb(var(--rose-500) / 0.1), transparent 70%), rgb(var(--surface-card));
        border: 1px solid rgb(var(--border-subtle));
        box-shadow: var(--shadow-lg);
        text-align: center;
    }

    .final__title {
        font-size: clamp(2rem, 5vw, 3.25rem);
        font-weight: 900;
        letter-spacing: -0.02em;
    }

    .final__lede {
        max-width: 32rem;
    }

    .final__ctas {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 12px;
        margin-top: 6px;
    }
</style>
