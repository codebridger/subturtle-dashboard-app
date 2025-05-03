<template>
    <div class="container mx-auto p-4">
        <div class="flex gap-8">
            <div class="w-1/5">
                <ProfileSidebar activeTab="profile" />
            </div>
            <div class="flex w-4/5 flex-col gap-4"></div>
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
