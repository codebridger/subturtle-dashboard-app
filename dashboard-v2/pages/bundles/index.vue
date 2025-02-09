<template>
    <div>
        <h1>Bundles list</h1>
    </div>
</template>

<script setup lang="ts">
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('bundle.list'),
        // @ts-ignore
        middleware: ['auth'],
    });
</script>
