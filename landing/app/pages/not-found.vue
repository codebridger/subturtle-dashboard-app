<template>
    <NotFound />
</template>

<script setup lang="ts">
    // Prerendered only to become dist/404.html, which Hosting serves for every miss (see the
    // `prerender:done` hook in nuxt.config.ts). The route itself is removed from the output.
</script>
