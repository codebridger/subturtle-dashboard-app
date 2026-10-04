<template>
    <div class="container missing">
        <p class="eyebrow">{{ missing ? 'Page not found' : 'Something went wrong' }}</p>
        <h1 class="missing__title">This line isn’t in the script.</h1>
        <p class="lede">{{ missing ? 'The page you asked for does not exist, or it moved.' : 'Please try again in a moment.' }}</p>
        <div class="missing__actions">
            <StButton href="/" size="lg">Go to the home page</StButton>
            <StButton :href="installHref" variant="outline" size="lg" @click="track('install-cta_clicked', { location: 'not-found' })">Add to Chrome</StButton>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';

    withDefaults(defineProps<{ missing?: boolean }>(), { missing: true });
    const { installHref } = useCta();

    useSeoMeta({ title: 'Page not found · Subturtle', robots: 'noindex' });
</script>

<style scoped>
    .missing {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 18px;
        padding-block: clamp(5rem, 14vw, 9rem);
    }

    .missing__title {
        font-size: clamp(2rem, 5vw, 3.25rem);
        font-weight: 900;
    }

    .missing__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 8px;
    }
</style>
