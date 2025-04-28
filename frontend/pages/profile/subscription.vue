<template>
    <div></div>
</template>

<script setup lang="ts">
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.title'),
        // @ts-ignore
        middleware: ['auth'],
    });
</script>
