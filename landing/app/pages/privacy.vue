<template>
    <LegalPage :html="html" />
</template>

<script setup lang="ts">
    // Ported word for word from the ClickUp page the Framer site linked to; edit the Markdown, not this.
    import html from '~/legal/privacy.md?html';

    usePageSeo({
        title: 'Privacy policy · Subturtle',
        description: 'How CodeBridger Ltd collects, uses and protects your information when you use Subturtle.',
        path: '/privacy',
    });
</script>
