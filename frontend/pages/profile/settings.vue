<template>
    <div class="container mx-auto px-4 py-8">
        <h1 class="mb-8 text-3xl font-bold">
            {{ t('settings') }}
        </h1>
        <div class="flex gap-8">
            <div class="w-1/4">
                <ProfileSidebar activeTab="settings" />
            </div>
            <div class="flex w-3/4 flex-col gap-4"></div>
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
