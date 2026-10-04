<template>
    <div class="container legal-wrap">
        <p class="eyebrow">Legal</p>
        <!-- Rendered from Markdown at build time (the `?html` loader in nuxt.config.ts); the text is ours. -->
        <article class="legal" v-html="html"></article>
    </div>
</template>

<script setup lang="ts">
    defineProps<{ html: string }>();
</script>

<style scoped>
    .legal-wrap {
        display: flex;
        flex-direction: column;
        gap: 18px;
        max-width: calc(46rem + 64px);
        padding-block: clamp(3rem, 8vw, 5rem);
    }

    .legal :deep(h1) {
        font-size: clamp(2rem, 5vw, 3rem);
        font-weight: 900;
        margin-bottom: 8px;
    }

    .legal :deep(h2) {
        margin: 2.2em 0 0.6em;
        font-size: 1.375rem;
        font-weight: 900;
    }

    .legal :deep(p),
    .legal :deep(ul),
    .legal :deep(ol) {
        margin: 0 0 1em;
        line-height: 1.7;
    }

    .legal :deep(ul),
    .legal :deep(ol) {
        padding-inline-start: 1.3em;
    }

    .legal :deep(li) {
        margin-bottom: 0.4em;
    }

    .legal :deep(strong) {
        color: rgb(var(--text-strong));
    }

    .legal :deep(code) {
        font-family: var(--font-mono);
        font-size: 0.9em;
        word-break: break-word;
    }

    .legal :deep(em) {
        color: rgb(var(--ink-600));
    }
</style>
