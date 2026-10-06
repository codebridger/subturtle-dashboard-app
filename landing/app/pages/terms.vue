<template>
    <LegalPage :html="html" />
</template>

<script setup lang="ts">
    // Ported word for word from the ClickUp page the Framer site linked to; edit the Markdown, not this.
    import html from '~/legal/terms.md?html';

    usePageSeo({
        title: 'Terms of service · Subturtle',
        description: 'The terms that govern your use of the Subturtle website, browser extension and services.',
        path: '/terms',
    });
</script>
