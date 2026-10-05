<template>
    <article class="row" :class="{ 'row--flip': flip, 'row--feature': feature }" :aria-labelledby="`loop-${step}`">
        <div class="row__copy">
            <p class="row__step">
                <span class="mono">{{ step }}</span> · {{ label }}
            </p>
            <h3 :id="`loop-${step}`" class="row__title"><slot name="title" /></h3>
            <div class="row__body"><slot /></div>
            <StBadge v-if="badge" color="accent" icon="solar:check-circle-bold" class="row__badge">{{ badge }}</StBadge>
        </div>
        <div class="row__art" role="img" :aria-label="art">
            <div class="row__art-inner" aria-hidden="true"><slot name="art" /></div>
        </div>
    </article>
</template>

<script setup lang="ts">
    import { StBadge } from 'subturtle-ui';

    defineProps<{
        step: number;
        label: string;
        /** What the illustration shows, for screen readers (the illustration itself is hidden). */
        art: string;
        badge?: string;
        /** Copy on the right on wide screens, for the alternating rhythm. */
        flip?: boolean;
        /** The payoff row: more room for the art. */
        feature?: boolean;
    }>();
</script>

<style scoped>
    .row {
        display: grid;
        gap: clamp(1.75rem, 4vw, 3.5rem);
        align-items: center;
    }

    .row__copy {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 14px;
        max-width: 32rem;
    }

    .row__step {
        font-size: 0.8125rem;
        font-weight: 800;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: rgb(var(--rose-700));
    }

    .row__title {
        font-size: clamp(1.75rem, 3.8vw, 2.5rem);
        font-weight: 900;
    }

    .row__body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-size: 1.0625rem;
        line-height: 1.65;
    }

    .row__badge {
        margin-top: 2px;
    }

    .row__art {
        position: relative;
        min-width: 0;
        overflow: hidden;
        border-radius: var(--radius-xl);
        border: 1px solid rgb(var(--border-subtle));
        background:
            radial-gradient(90% 70% at 85% 10%, rgb(var(--rose-500) / 0.07), transparent 70%),
            linear-gradient(170deg, rgb(var(--white)), rgb(var(--ink-50)) 70%, rgb(var(--ink-100)));
        box-shadow: var(--shadow-md);
    }

    .row__art-inner {
        display: grid;
        place-items: center;
        min-height: 320px;
        padding: clamp(20px, 4vw, 36px);
    }

    @media (min-width: 900px) {
        .row {
            grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        }

        .row--flip .row__copy {
            order: 2;
        }

        .row--feature {
            grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
        }

        .row--feature .row__art-inner {
            min-height: 400px;
        }
    }
</style>
