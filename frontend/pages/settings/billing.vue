<template>
    <div class="relative min-h-screen">
        <div class="container relative mx-auto max-w-3xl px-6 py-16">
            <PageHeader :title="t('subscription.billing-page.title')" overline="BILLING" />
            <div class="mt-6">
                <TopUpsSection />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import PageHeader from '~/components/common/PageHeader.vue';
    import TopUpsSection from '~/components/TopUpsSection.vue';
    import { useProfileStore } from '~/stores/profile';
    import { useVoiceTopUp } from '~/composables/useVoiceTopUp';
    import { toastSuccess, toastError, toastInfo } from 'pilotui/toast';

    const { t } = useI18n();
    const route = useRoute();
    const profileStore = useProfileStore();
    const { PENDING_KEY } = useVoiceTopUp();

    definePageMeta({
        layout: 'default',
        // @ts-ignore
        middleware: ['auth'],
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Total available voice minutes (base remaining + non-expired top-up remaining).
    function voiceRemaining(): number {
        const s = profileStore.activeSubscription as any;
        if (!s) return 0;
        const base = s.entitlements?.voiceMinutesGranted ?? s.voice_minutes_total ?? 0;
        const baseRemaining = Math.max(0, base - (s.voice_minutes_used ?? 0));
        const topUp = (s.active_top_ups ?? []).reduce((acc: number, p: any) => acc + (p.minutes_remaining ?? 0), 0);
        return baseRemaining + topUp;
    }

    // On return from Stripe (new tab), poll for the async webhook grant, then confirm.
    onMounted(async () => {
        const topup = route.query.topup;
        if (topup === 'success') {
            let before = 0;
            try {
                before = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}').total ?? 0;
            } catch {
                /* ignore */
            }
            let granted = false;
            for (let i = 0; i < 7; i++) {
                await profileStore.fetchSubscription();
                const total = (profileStore.activeSubscription as any)?.voice_minutes_total ?? 0;
                if (total > before) {
                    granted = true;
                    break;
                }
                await sleep(1500);
            }
            try {
                localStorage.removeItem(PENDING_KEY);
            } catch {
                /* ignore */
            }
            if (granted) toastSuccess(t('subscription.top-ups.added-toast', { n: voiceRemaining() }), { position: 'top-end' });
            else toastInfo(t('subscription.top-ups.pending-toast'), { position: 'top-end' });
        } else if (topup === 'cancelled') {
            toastError(t('subscription.top-ups.cancelled-toast'), { position: 'top-end' });
        }
    });
</script>
