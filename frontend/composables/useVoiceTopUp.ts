import { ref } from 'vue';
import { functionProvider } from '@modular-rest/client';
import { useProfileStore } from '~/stores/profile';

export interface TopUpPack {
    key: 'topup_30' | 'topup_120';
    minutes: number;
    gbp: number; // GBP base (Adaptive Pricing localizes at checkout)
    bestValue?: boolean;
}

// Council 004 overage packs (GBP base prices; setup:stripe seeds the products).
export const TOP_UP_PACKS: TopUpPack[] = [
    { key: 'topup_30', minutes: 30, gbp: 4.49 },
    { key: 'topup_120', minutes: 120, gbp: 15.99, bestValue: true },
];

const PENDING_KEY = 'subturtle.topupPending';

/**
 * Localize a GBP price using the cached Adaptive Pricing probe (the subscription
 * page populates `subturtle.localPricing`); falls back to the GBP base when the
 * probe hasn't run or the visitor is in GBP.
 */
export function localizeGbp(gbp: number): string {
    try {
        const c = JSON.parse(sessionStorage.getItem('subturtle.localPricing') || 'null');
        if (c?.currency && c?.fxRate) {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: c.currency }).format(gbp * c.fxRate);
        }
    } catch {
        /* fall through to GBP */
    }
    return `£${gbp.toFixed(2)}`;
}

/**
 * Shared voice top-up purchase: opens a Stripe-hosted checkout in a new tab. The
 * webhook grants the minutes; the /settings/billing return handler polls for them.
 * Records the pre-purchase voice total in localStorage (shared across tabs) so the
 * return tab can detect the grant landed.
 */
export function useVoiceTopUp() {
    const profileStore = useProfileStore();
    const loadingKey = ref<string | null>(null);

    async function buyPack(packKey: 'topup_30' | 'topup_120') {
        loadingKey.value = packKey;
        try {
            const sub = profileStore.activeSubscription as any;
            try {
                localStorage.setItem(PENDING_KEY, JSON.stringify({ total: sub?.voice_minutes_total ?? 0 }));
            } catch {
                /* ignore */
            }
            const origin = window.location.origin;
            const { url } = await functionProvider.run<{ url: string }>({
                name: 'create-voice-topup-checkout',
                args: {
                    packKey,
                    userId: profileStore.authUser?.id,
                    successUrl: `${origin}/#/settings/billing?topup=success&pack=${packKey}`,
                    cancelUrl: `${origin}/#/settings/billing?topup=cancelled`,
                },
            });
            if (url) window.open(url, '_blank');
        } finally {
            loadingKey.value = null;
        }
    }

    return { loadingKey, buyPack, PENDING_KEY };
}
