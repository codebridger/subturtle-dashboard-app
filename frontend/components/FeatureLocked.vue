<template>
    <div class="flex flex-1 flex-col items-center justify-center py-12">
        <div
            class="flex max-w-xl flex-col items-center justify-center rounded-3xl border border-white/20 bg-white/40 p-12 text-center shadow-xl backdrop-blur-md dark:bg-gray-800/40"
        >
            <!-- Feature-keyed illustration; decorative — the title carries the meaning. -->
            <slot name="icon">
                <Icon :name="iconName" class="h-12 w-12 text-primary" aria-hidden="true" />
            </slot>

            <h2 class="mt-6 text-xl font-bold text-gray-900 dark:text-gray-100">
                {{ t(`subscription.feature-locked.${featureKey}.title`) }}
            </h2>
            <p class="mt-2 max-w-md text-base text-gray-500 dark:text-gray-400">
                {{ t(`subscription.feature-locked.${featureKey}.body`) }}
            </p>

            <div class="mt-8 flex flex-col items-center gap-3">
                <Button color="primary" :label="t(`subscription.feature-locked.${featureKey}.cta`)" @click="goUpgrade" />
                <button v-if="showSeePlans" type="button" class="text-sm font-medium text-primary hover:underline" @click="goToPlans">
                    {{ t('subscription.feature-locked.see-all-plans') }}
                </button>
            </div>

            <slot name="extra" />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Icon, Button } from 'pilotui/elements';

    /**
     * Shared "this feature is part of a higher tier" panel (Council 004, UX spec Surface 7).
     * One look for every gated feature — replaces the per-page bespoke lock panels.
     *
     * The PARENT decides when a feature is locked (e.g. from a 400 TIER_LIMIT_REACHED) and
     * renders this; the component only paints copy + CTAs, it does not resolve entitlements
     * itself. Copy variants are keyed by `featureKey` in locales/en.json.
     */
    type FeatureKey = 'session_history' | 'weekly_insights' | 'voice_chat';
    type RequiredTier = 'reader' | 'learner' | 'coach';

    const props = withDefaults(
        defineProps<{
            featureKey: FeatureKey;
            requiredTier: RequiredTier;
            showSeePlans?: boolean;
        }>(),
        { showSeePlans: true }
    );

    const { t } = useI18n();
    const router = useRouter();

    // Feature-keyed default icon (overridable via the #icon slot), from the pilotui set.
    const ICONS: Record<FeatureKey, string> = {
        session_history: 'IconCalendar',
        weekly_insights: 'IconBarChart',
        voice_chat: 'IconMicrophoneOff',
    };
    const iconName = computed(() => ICONS[props.featureKey] ?? 'IconLockDots');

    // Primary CTA pre-selects the required tier on the pricing page; secondary lists all.
    function goUpgrade() {
        router.push(`/settings/subscription?suggest=${props.requiredTier}`);
    }
    function goToPlans() {
        router.push('/settings/subscription');
    }
</script>
