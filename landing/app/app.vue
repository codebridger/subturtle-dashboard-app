<template>
    <a class="skip-link" href="#main">Skip to content</a>
    <SiteHeader />
    <main id="main">
        <NuxtPage />
    </main>
    <SiteFooter />
    <ConsentBanner />
</template>

<script setup lang="ts">
    // No layouts on purpose: a layout is resolved by dynamic import, and its scoped styles were not
    // linked in prerendered HTML in the sibling kilogent-landing site. The shell lives here instead.
    const utm = useUtm();
    const route = useRoute();
    const router = useRouter();
    const { init } = useAnalytics();

    onMounted(async () => {
        await router.isReady();
        captureUtm(utm, route.query);
        init();
    });
</script>
