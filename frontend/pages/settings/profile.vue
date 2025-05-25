<template>
    <div class="p-4">
        <div class="flex gap-8">
            <h1 class="text-2xl font-bold">{{ t('profile.profile') }}</h1>
        </div>
    </div>
</template>

<script lang="ts" setup>
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('profile.profile'),
        // @ts-ignore
        middleware: ['auth'],
    });
</script>
