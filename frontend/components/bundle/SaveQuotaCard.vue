<template>
    <StCard padding="md" elevation="none">
        <div class="flex flex-wrap items-center gap-4">
            <span
                class="flex h-11 w-11 flex-none items-center justify-center rounded-st-md"
                :class="isFreemium ? 'bg-st-primary-soft text-st-primary' : 'bg-st-accent-soft text-st-jade-600'"
            >
                <StIcon :name="isFreemium ? 'solar:lock-keyhole-bold' : 'solar:bookmark-bold-duotone'" :size="22" />
            </span>

            <div class="min-w-[220px] flex-1">
                <div class="text-st-base font-extrabold text-st-strong">{{ headline }}</div>
                <p class="mt-0.5 text-st-sm font-semibold text-st-muted [text-wrap:pretty]">{{ caption }}</p>
            </div>

            <!-- The meter reads the same allocation as the headline, so it is only drawn where
                 there is a cap to read against. -->
            <StProgressBar
                v-if="isFreemium"
                class="w-full min-w-[120px] max-w-[220px] flex-1"
                :value="usedCount"
                :max="totalCount || 1"
                :color="isAtLimit ? 'danger' : 'primary'"
                size="sm"
                :aria-label="headline"
            />

            <StButton color="primary" :icon="isAtLimit ? 'solar:crown-bold' : 'solar:add-circle-bold'" class="flex-none" @click="onAction">
                {{ isAtLimit ? t('freemium.limitation.upgrade_now') : t('bundle.add_phrase') }}
            </StButton>
        </div>
    </StCard>
</template>

<script setup lang="ts">
    /**
     * The design's saves row on the bundle detail screen: how much of the free save allowance is
     * gone, when it renews, and the button that adds a phrase.
     *
     * On a paid plan there is no cap to show, so the same row keeps the button in the place the
     * user learned it and says the saves are unlimited instead of drawing an empty meter. The
     * app-wide `FreemiumLimitCard` stays where it is — it is the pilotui-era card the live
     * session flows still use.
     */
    import { StButton, StCard, StIcon, StProgressBar } from 'subturtle-ui';
    import { useProfileStore } from '~/stores/profile';

    const { t } = useI18n();
    const profileStore = useProfileStore();

    const emit = defineEmits<{
        /** There is room to save: add an empty phrase row. */
        add: [];
        /** The free allowance is used up: the page decides between the upsell modal and the plans page. */
        'upgrade-needed': [];
    }>();

    const isFreemium = computed(() => profileStore.isFreemium);
    const usedCount = computed(() => profileStore.freemiumAllocation?.allowed_save_words_used ?? 0);
    const totalCount = computed(() => profileStore.freemiumAllocation?.allowed_save_words ?? 0);
    const isAtLimit = computed(() => isFreemium.value && totalCount.value > 0 && usedCount.value >= totalCount.value);

    const headline = computed(() =>
        isFreemium.value ? t('bundle.saves.used', { used: usedCount.value, total: totalCount.value }) : t('bundle.saves.unlimited')
    );

    const caption = computed(() => {
        if (!isFreemium.value) return t('bundle.saves.unlimited_description');

        const end = profileStore.freemiumAllocation?.end_date;
        const resetsOn = end ? new Date(end) : null;

        // An allocation with no end date is possible (older records), and a made-up renewal day
        // would be worse than none — the sentence just stops at the description.
        if (!resetsOn || Number.isNaN(resetsOn.getTime())) return t('freemium.limitation.free_spots_left') + '.';

        return `${t('freemium.limitation.free_spots_left')}. ${t('bundle.saves.resets_on', {
            date: resetsOn.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        })}`;
    });

    function onAction() {
        if (isAtLimit.value) emit('upgrade-needed');
        else emit('add');
    }
</script>
