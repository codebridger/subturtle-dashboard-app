<template>
    <div class="relative min-h-screen">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none">
        </div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none">
        </div>

        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <PageHeader :title="t('live-session.start-new-session')"
                :breadcrumbs="[{ label: t('live-session.your-sessions'), to: '/sessions' }, { label: t('live-session.start-new-session') }]" />

            <section>
                <LiveSessionStartNew />
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
import PageHeader from '~/components/common/PageHeader.vue';
definePageMeta({
    layout: 'default',
    title: () => t('live-session.start-new-session'),
    middleware: ['auth'],
});
</script>
