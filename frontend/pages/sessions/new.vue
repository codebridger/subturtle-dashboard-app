<template>
    <section class="p-4">
        <LiveSessionStartNew />
    </section>
</template>

<script setup lang="ts">
    const { t } = useI18n();
    definePageMeta({
        layout: 'default',
        title: () => t('live-session.start-new-session'),
        middleware: ['auth'],
    });
</script>
