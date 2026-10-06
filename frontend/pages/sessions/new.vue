<template>
    <div class="flex flex-col gap-6">
        <StPageHeader :title="t('live-session.start-a-session')" :overline="t('live-session.overline')" :subtitle="t('live-session.start-new-subtitle')">
            <template v-if="lastSession" #actions>
                <StButton variant="outline" color="neutral" pill icon="solar:history-2-bold-duotone" @click="repeatLast">
                    {{ t('live-session.repeat-last') }}
                </StButton>
            </template>
        </StPageHeader>

        <LiveSessionGeminiStartNew ref="startRef" />
    </div>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import { readLastSession, type LastSession } from '~/composables/useLastSession';

    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('live-session.start-a-session'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const startRef = ref<any>(null);
    const lastSession = ref<LastSession | null>(null);

    // Read on mount, not at setup: localStorage does not exist until the client runs.
    onMounted(() => {
        lastSession.value = readLastSession();
    });

    // Fills the form in rather than starting straight away, so the setup is visible and
    // adjustable before any voice minutes are spent.
    function repeatLast() {
        if (lastSession.value) startRef.value?.applyLastSession(lastSession.value);
    }
</script>
