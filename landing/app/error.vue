<template>
    <a class="skip-link" href="#main">Skip to content</a>
    <SiteHeader />
    <main id="main">
        <NotFound :missing="error?.statusCode === 404" />
    </main>
    <SiteFooter />
</template>

<script setup lang="ts">
    import type { NuxtError } from '#app';

    defineProps<{ error: NuxtError }>();
</script>
