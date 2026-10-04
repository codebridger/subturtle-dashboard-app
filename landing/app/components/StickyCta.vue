<template>
    <!-- Phones only: once the hero's buttons have scrolled away, keep the install one in reach. It stays
         out of the way of the consent banner and can be dismissed for the visit. -->
    <div v-if="visible" class="sticky-cta">
        <StButton :href="installHref" size="lg" block icon="solar:add-circle-bold" @click="track('install-cta_clicked', { location: 'sticky' })">
            Add to Chrome, it's free
        </StButton>
        <button type="button" class="sticky-cta__close" aria-label="Hide this bar" @click="dismissed = true">
            <StIcon name="solar:close-circle-linear" :size="22" />
        </button>
    </div>
</template>

<script setup lang="ts">
    import { StButton, StIcon } from 'subturtle-ui';

    const props = defineProps<{ watch: string }>();

    const { installHref } = useCta();
    const { consent, enabled } = useAnalytics();
    const passed = ref(false);
    const dismissed = ref(false);

    const visible = computed(() => passed.value && !dismissed.value && !(enabled && consent.value === null));

    let observer: IntersectionObserver | null = null;
    onMounted(() => {
        const target = document.getElementById(props.watch);
        if (!target || !('IntersectionObserver' in window)) return;
        observer = new IntersectionObserver(([entry]) => {
            if (!entry) return;
            // Only once it has gone off the TOP: not while the visitor is still above it.
            passed.value = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        });
        observer.observe(target);
    });
    onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
    .sticky-cta {
        position: fixed;
        z-index: var(--z-sticky);
        inset-inline: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px)) 16px;
        background: rgb(var(--paper) / 0.94);
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
        border-top: 1px solid rgb(var(--border-subtle));
    }

    .sticky-cta__close {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 12px;
        background: none;
        color: rgb(var(--ink-600));
        cursor: pointer;
    }

    @media (min-width: 768px) {
        .sticky-cta {
            display: none;
        }
    }
</style>
