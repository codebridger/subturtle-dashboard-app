<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader :title="t('live-session.start-new-session')" :overline="t('live-session.overline')" :subtitle="t('live-session.start-new-subtitle')">
            <template #actions>
                <StButton variant="outline" color="neutral" icon="solar:history-2-bold-duotone" @click="goToHistory">
                    {{ t('live-session.session-history') }}
                </StButton>
            </template>
        </StPageHeader>

        <LiveSessionGeminiStartNew />
    </div>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';

    const { t } = useI18n();
    const router = useRouter();

    definePageMeta({
        layout: 'default',
        title: () => t('live-session.start-new-session'),
        // @ts-ignore
        middleware: ['auth'],
    });

    function goToHistory() {
        router.push('/sessions');
    }
</script>
