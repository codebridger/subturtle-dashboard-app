<template>
    <div class="relative flex flex-col gap-5">
        <!-- Save failure. pilotui's toaster renders nothing in this app (it asks for a
             `TairoToaster` component nobody registers), so a failed save had no visible outcome
             at all; the design's banner is the one that reports it. -->
        <div v-if="saveFailed" class="flex items-center gap-3.5 rounded-st-md border border-st-danger bg-st-danger-soft px-[18px] py-3.5">
            <StIcon name="solar:danger-triangle-bold" :size="22" class="flex-none text-st-danger" />
            <div class="min-w-0 flex-1">
                <div class="text-st-sm font-extrabold text-st-strong">{{ t('smart_review.save_failed_title') }}</div>
                <p class="mt-0.5 text-st-xs font-semibold text-st-muted">{{ t('smart_review.save_failed_body') }}</p>
            </div>
            <StButton variant="soft" color="danger" size="sm" icon="solar:refresh-bold" :disabled="loading" @click="performSave">
                {{ t('smart_review.try_again') }}
            </StButton>
        </div>

        <!-- Header: status, Discard, Save -->
        <div class="flex flex-wrap items-end justify-between gap-8">
            <div>
                <div class="st-overline mb-2">{{ t('smart_review.title') }}</div>
                <h1 class="font-st-display text-st-2xl font-black leading-[1.05] tracking-st-tight text-st-strong">
                    {{ t('smart_review.page_title') }}
                </h1>
                <p class="mt-2 max-w-[29rem] text-st-base font-semibold leading-normal text-st-muted [text-wrap:pretty]">
                    {{ t('smart_review.page_subtitle') }}
                </p>
            </div>

            <div class="flex flex-none items-center gap-3">
                <span class="inline-flex items-center gap-2 text-st-xs font-extrabold" :class="settingsDirty || saveFailed ? 'text-st-body' : 'text-st-muted'">
                    <span class="h-2 w-2 rounded-full" :class="saveFailed ? 'bg-st-danger' : settingsDirty ? 'bg-st-warning' : 'bg-st-accent'" />
                    {{ statusLabel }}
                </span>
                <StButton v-if="settingsDirty" variant="ghost" color="neutral" :disabled="loading" @click="discard">
                    {{ t('smart_review.discard') }}
                </StButton>
                <StButton
                    :variant="settingsDirty ? 'solid' : 'soft'"
                    color="primary"
                    icon="solar:diskette-bold"
                    class="whitespace-nowrap"
                    :disabled="!settingsDirty || loading || resetting"
                    @click="performSave"
                >
                    {{ t('smart_review.save_preferences') }}
                </StButton>
            </div>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
            <StStatTile icon="solar:bookmark-bold-duotone" :value="stats?.totalItems || 0" :label="t('smart_review.collected_phrases')" />
            <StStatTile icon="solar:clock-circle-bold-duotone" accent="accent" :value="`${localSettings.reviewHour}:00`" :label="reviewCadenceLabel" />
            <StStatTile
                icon="solar:layers-minimalistic-bold-duotone"
                accent="warning"
                :value="localSettings.totalBoxes"
                :label="t('smart_review.step_progression')"
            />
        </div>

        <div class="flex flex-wrap items-start gap-5">
            <!-- Left column: the journey + start over -->
            <div class="flex min-w-[288px] max-w-[328px] flex-[1_1_328px] flex-col gap-[14px]">
                <StCard>
                    <div class="st-overline mb-4">{{ t('smart_review.the_journey') }}</div>

                    <div class="flex flex-col gap-4">
                        <div class="flex items-start justify-between gap-3.5">
                            <div class="min-w-0">
                                <div class="text-st-sm font-extrabold text-st-strong">{{ t('smart_review.auto_entry') }}</div>
                                <p class="mt-[3px] text-st-xs font-semibold text-st-muted">{{ t('smart_review.auto_entry_desc') }}</p>
                            </div>
                            <StSwitch v-model="localSettings.autoEntry" :aria-label="t('smart_review.auto_entry')" />
                        </div>

                        <div class="h-px bg-st-line" />

                        <div class="flex items-center justify-between gap-3.5">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="text-st-sm font-extrabold text-st-strong">{{ t('smart_review.total_levels') }}</span>
                                    <StBadge v-if="changed.totalBoxes" color="warning">{{ t('smart_review.changed') }}</StBadge>
                                </div>
                                <p class="mt-[3px] text-st-xs font-semibold text-st-muted">{{ t('smart_review.total_levels_note') }}</p>
                            </div>
                            <StInput
                                :model-value="localSettings.totalBoxes"
                                type="number"
                                min="1"
                                max="10"
                                class="w-[82px]"
                                @update:model-value="localSettings.totalBoxes = clamp($event, 1, 10)"
                            />
                        </div>

                        <div class="h-px bg-st-line" />

                        <div class="flex items-center justify-between gap-3.5">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="text-st-sm font-extrabold text-st-strong">{{ t('smart_review.global_daily_limit') }}</span>
                                    <StBadge v-if="changed.dailyLimit" color="warning">{{ t('smart_review.changed') }}</StBadge>
                                </div>
                                <p class="mt-[3px] text-st-xs font-semibold text-st-muted">{{ t('smart_review.max_phrases_desc') }}</p>
                            </div>
                            <StInput
                                :model-value="localSettings.dailyLimit"
                                type="number"
                                min="1"
                                class="w-[82px]"
                                @update:model-value="localSettings.dailyLimit = clamp($event, 1, 999)"
                            />
                        </div>

                        <div class="h-px bg-st-line" />

                        <div>
                            <div class="text-st-sm font-extrabold text-st-strong">{{ t('smart_review.review_interval') }}</div>
                            <p class="mb-2.5 mt-[3px] text-st-xs font-semibold text-st-muted">{{ t('smart_review.session_frequency_desc') }}</p>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('smart_review.each') }}</span>
                                <StInput
                                    :model-value="localSettings.reviewInterval"
                                    type="number"
                                    min="1"
                                    class="w-16"
                                    @update:model-value="localSettings.reviewInterval = clamp($event, 1, 30)"
                                />
                                <span class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('smart_review.day_at') }}</span>
                                <!-- The design shows a time field ("9:00 AM"); the stored value is
                                     an integer hour, so this is a 0-23 number with the minutes
                                     spelled out beside it rather than a format the model can't hold. -->
                                <StInput
                                    :model-value="localSettings.reviewHour"
                                    type="number"
                                    min="0"
                                    max="23"
                                    class="w-[72px]"
                                    @update:model-value="localSettings.reviewHour = clamp($event, 0, 23)"
                                />
                                <span class="text-st-xs font-bold text-st-muted">:00</span>
                            </div>
                            <p class="mt-2.5 text-st-xs font-semibold text-st-muted">
                                {{ t('smart_review.times_follow', { zone: timeZone }) }}
                                <NuxtLink to="/settings/profile" class="font-bold text-st-link hover:underline">{{
                                    t('smart_review.setup_timezone')
                                }}</NuxtLink>
                            </p>
                        </div>
                    </div>
                </StCard>

                <StCard>
                    <div class="mb-1.5 text-st-sm font-extrabold text-st-strong">{{ t('smart_review.start_over') }}</div>
                    <p class="mb-3 text-st-xs font-semibold leading-normal text-st-muted">{{ resetNote }}</p>
                    <StButton variant="ghost" color="danger" size="sm" icon="solar:restart-bold" class="whitespace-nowrap" @click="resetOpen = true">
                        {{ t('smart_review.reset_progress') }}
                    </StButton>
                </StCard>
            </div>

            <!-- Right column: the chain -->
            <div class="flex min-w-0 flex-[1_1_640px] flex-col gap-3">
                <div class="flex flex-wrap items-baseline justify-between gap-4">
                    <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">{{ t('smart_review.the_chain') }}</h2>
                    <span class="text-st-xs font-bold text-st-faint">{{ chainNote }}</span>
                </div>

                <StCard v-if="!stats?.totalItems" padding="none">
                    <StEmptyState
                        icon="solar:bookmark-bold-duotone"
                        color="neutral"
                        :title="t('smart_review.empty_chain_title')"
                        :description="t('smart_review.empty_chain_description')"
                    />
                </StCard>

                <div
                    v-for="level in chain"
                    :key="level.n"
                    class="overflow-hidden rounded-st-lg border bg-st-card shadow-st-sm"
                    :class="openLevel === level.n ? 'border-st-primary' : 'border-st-line'"
                >
                    <div class="flex flex-wrap items-center gap-4 px-[18px] py-3.5">
                        <span
                            class="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-st-sm border-[1.5px] font-st-display text-st-sm font-black"
                            :class="level.chipClass"
                        >
                            {{ level.n }}
                        </span>

                        <div class="min-w-[180px] flex-1">
                            <div class="flex items-center gap-2.5">
                                <span class="text-st-sm font-extrabold text-st-strong">{{ t('smart_review.level_number', { number: level.n }) }}</span>
                                <StBadge v-if="level.tag" :color="level.tagColor">{{ level.tag }}</StBadge>
                            </div>
                            <p class="mt-1 text-st-xs font-semibold text-st-muted">{{ level.note }}</p>
                            <div class="mt-[7px] flex items-center gap-2.5">
                                <div class="h-1.5 max-w-[170px] flex-1 overflow-hidden rounded-st-pill bg-st-ink-150">
                                    <div class="h-full rounded-st-pill" :class="level.barClass" :style="{ width: level.barWidth }" />
                                </div>
                                <span class="text-st-xs font-bold text-st-muted">{{ t('smart_review.n_cards', { count: level.count }) }}</span>
                            </div>
                        </div>

                        <div class="flex min-w-0 flex-wrap items-end gap-3.5">
                            <div class="flex min-w-0 flex-col gap-1.5">
                                <span class="inline-flex items-center gap-1.5 text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">
                                    <StIcon name="solar:calendar-minimalistic-linear" :size="13" />
                                    {{ t('smart_review.interval') }}
                                </span>
                                <div class="flex min-w-0 items-center gap-[7px]">
                                    <StInput
                                        :model-value="localSettings.boxIntervals[level.i]"
                                        type="number"
                                        min="1"
                                        class="w-[70px]"
                                        @update:model-value="localSettings.boxIntervals[level.i] = clamp($event, 1, 999)"
                                    />
                                    <span class="w-[30px] text-st-xs font-bold text-st-muted">{{ t('smart_review.days') }}</span>
                                </div>
                            </div>

                            <div class="flex flex-col gap-1.5">
                                <span class="inline-flex items-center gap-1.5 text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">
                                    <StIcon name="solar:bolt-linear" :size="13" />
                                    {{ t('smart_review.quota') }}
                                </span>
                                <div class="flex min-w-0 items-center gap-[7px]">
                                    <StInput
                                        :model-value="localSettings.boxQuotas[level.i]"
                                        type="number"
                                        min="0"
                                        class="w-[70px]"
                                        @update:model-value="localSettings.boxQuotas[level.i] = clamp($event, 0, 999)"
                                    />
                                    <span class="w-[30px] text-st-xs font-bold text-st-muted">{{ t('smart_review.items') }}</span>
                                </div>
                            </div>
                        </div>

                        <StButton
                            :variant="openLevel === level.n ? 'solid' : 'soft'"
                            color="primary"
                            size="sm"
                            icon="solar:tuning-2-bold"
                            @click="toggleLevel(level.n)"
                        >
                            {{ t('smart_review.manage') }}
                        </StButton>
                    </div>

                    <!-- One level open at a time; the picker follows it. -->
                    <LeitnerPhrasePicker
                        v-if="openLevel === level.n"
                        :target-box="openLevel"
                        :total-boxes="localSettings.totalBoxes"
                        @phrase-added="handlePhraseChange"
                        @phrase-removed="handlePhraseChange"
                    />
                </div>
            </div>
        </div>

        <StModal
            :open="resetOpen"
            :title="t('smart_review.reset_title')"
            :description="t('smart_review.reset_description')"
            :dismissible="!resetting"
            @close="resetOpen = false"
        >
            <div class="my-1 flex flex-col gap-2.5">
                <div class="flex items-start gap-2.5 text-st-sm font-semibold text-st-body">
                    <StIcon name="solar:close-circle-bold" :size="18" class="mt-0.5 flex-none text-st-danger" />
                    {{ t('smart_review.reset_loses', { count: stats?.totalItems || 0 }) }}
                </div>
                <div class="flex items-start gap-2.5 text-st-sm font-semibold text-st-body">
                    <StIcon name="solar:check-circle-bold" :size="18" class="mt-0.5 flex-none text-st-accent" />
                    {{ t('smart_review.reset_keeps') }}
                </div>
            </div>

            <template #actions>
                <StButton variant="ghost" color="neutral" :disabled="resetting" @click="resetOpen = false">
                    {{ t('smart_review.keep_everything') }}
                </StButton>
                <StButton color="danger" :disabled="resetting" @click="performReset">
                    {{ t('smart_review.confirm_wipe') }}
                </StButton>
            </template>
        </StModal>
    </div>
</template>

<script lang="ts" setup>
    import { ref, watch } from 'vue';
    import { StBadge, StButton, StCard, StEmptyState, StIcon, StInput, StModal, StStatTile, StSwitch } from 'subturtle-ui';
    import { toastSuccess, toastError } from 'pilotui/toast';
    import LeitnerPhrasePicker from './LeitnerPhrasePicker.vue';
    import { functionProvider } from '@modular-rest/client';
    import { useProfileStore } from '~/stores/profile';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    interface Settings {
        dailyLimit: number;
        totalBoxes: number;
        boxIntervals: number[];
        boxQuotas: number[];
        autoEntry: boolean;
        reviewInterval: number;
        reviewHour: number;
    }

    const props = defineProps<{
        stats?: {
            settings: Settings;
            distribution: Record<string, number>;
            totalItems: number;
        };
    }>();

    const emit = defineEmits(['saved', 'reset']);

    const profileStore = useProfileStore();

    const { authUser } = storeToRefs(profileStore);
    const { t } = useI18n();

    const loading = ref(false);
    const resetting = ref(false);
    const saveFailed = ref(false);
    const resetOpen = ref(false);

    // Default state
    const localSettings = ref<Settings>({
        dailyLimit: 20,
        totalBoxes: 5,
        boxIntervals: [1, 2, 4, 8, 16],
        boxQuotas: [20, 10, 5, 5, 5],
        autoEntry: true,
        reviewInterval: 1,
        reviewHour: 9,
    });

    const openLevel = ref<number | null>(null);
    const isDirty = ref(false); // Phrase changes dirty state
    const settingsDirty = ref(false); // Settings configuration dirty state

    /** Which fields moved since the last sync — drives the "Changed" pills and the status count. */
    const changed = ref<Record<string, boolean>>({});

    function toggleLevel(n: number) {
        openLevel.value = openLevel.value === n ? null : n;
        isDirty.value = false;
    }

    function handlePhraseChange() {
        isDirty.value = true;
    }

    // Closing the panel after a phrase moved refetches the stats, as closing the modal used to.
    watch(openLevel, (now, before) => {
        if (before !== null && now !== before && isDirty.value) {
            emit('saved');
            isDirty.value = false;
        }
    });

    watch(
        () => localSettings.value.totalBoxes,
        () => {
            adjustArrays();
            // A shorter chain can leave an open panel pointing at a level that no longer exists.
            if (openLevel.value && openLevel.value > localSettings.value.totalBoxes) openLevel.value = null;
        }
    );

    watch(
        localSettings,
        () => {
            settingsDirty.value = true;
        },
        { deep: true }
    );

    // Sync props to local state
    watch(
        () => props.stats,
        (newVal) => {
            if (newVal && newVal.settings) {
                // deep copy to avoid mutations prop warnings if object is shared
                localSettings.value = JSON.parse(JSON.stringify(newVal.settings));
                // Ensure arrays are filled if data is partial
                adjustArrays();
                // Reset dirty state after sync
                setTimeout(() => {
                    // Ensure defaults if missing in restored settings
                    if (!localSettings.value.reviewInterval) localSettings.value.reviewInterval = 1;
                    if (localSettings.value.reviewHour === undefined) localSettings.value.reviewHour = 9;
                    settingsDirty.value = false;
                    changed.value = {};
                }, 0);
            }
        },
        { immediate: true, deep: true }
    );

    /** Field-level diff against the fetched settings, for the "Changed" pills. */
    watch(
        localSettings,
        (now) => {
            const saved = props.stats?.settings;
            if (!saved) return;
            // Only the overlapping range: growing or shrinking totalBoxes resizes both arrays via
            // adjustArrays, and counting that as its own edit reported "3 unsaved changes" for a
            // single change of the level count. A real per-level edit still lands inside the range.
            const overlaps = (a: number[] = [], b: number[] = []) => {
                const n = Math.min(a.length, b.length);
                return a.slice(0, n).join() !== b.slice(0, n).join();
            };

            changed.value = {
                totalBoxes: now.totalBoxes !== saved.totalBoxes,
                dailyLimit: now.dailyLimit !== saved.dailyLimit,
                autoEntry: now.autoEntry !== saved.autoEntry,
                reviewInterval: now.reviewInterval !== saved.reviewInterval,
                reviewHour: now.reviewHour !== saved.reviewHour,
                boxIntervals: overlaps(now.boxIntervals, saved.boxIntervals),
                boxQuotas: overlaps(now.boxQuotas, saved.boxQuotas),
            };
        },
        { deep: true }
    );

    const changedCount = computed(() => Object.values(changed.value).filter(Boolean).length);

    const statusLabel = computed(() => {
        if (saveFailed.value) return t('smart_review.not_saved');
        if (!settingsDirty.value) return t('smart_review.settings_synced');
        return changedCount.value ? t('smart_review.n_unsaved', changedCount.value) : t('smart_review.unsaved_changes');
    });

    /** The profile's timezone, falling back to the browser's rather than a hardcoded UTC. */
    const timeZone = computed(() => {
        if (profileStore.userDetail?.timeZone) return profileStore.userDetail.timeZone;
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            return 'UTC';
        }
    });

    const reviewCadenceLabel = computed(() =>
        localSettings.value.reviewInterval === 1
            ? t('smart_review.daily_in_zone', { zone: timeZone.value })
            : t('smart_review.every_days_in_zone', { days: localSettings.value.reviewInterval, zone: timeZone.value })
    );

    const chainNote = computed(() =>
        props.stats?.totalItems ? t('smart_review.chain_note', { count: props.stats.totalItems }) : t('smart_review.chain_note_empty')
    );

    const resetNote = computed(() =>
        props.stats?.totalItems ? t('smart_review.reset_note', { count: props.stats.totalItems }) : t('smart_review.reset_note_empty')
    );

    /**
     * One entry per level. Cloze really does begin at level 3 (`FlashCard.vue` switches on
     * `leitnerLevel >= 3`), so that tag is a fact about the app, not decoration.
     */
    const chain = computed(() => {
        const total = localSettings.value.totalBoxes;
        const counts = Array.from({ length: total }, (_, i) => getItemCount(i));
        const peak = Math.max(1, ...counts);

        return Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const last = n === total;
            const count = counts[i];

            let tag = '';
            let tagColor: 'info' | 'primary' | 'accent' = 'primary';
            if (n === 1) {
                tag = t('smart_review.entrance');
                tagColor = 'info';
            } else if (last) {
                tag = t('smart_review.mature');
                tagColor = 'accent';
            } else if (n === 3) {
                tag = t('smart_review.cloze');
                tagColor = 'primary';
            }

            const note =
                n === 1
                    ? t('smart_review.note_entrance')
                    : n === 3
                    ? t('smart_review.note_cloze')
                    : last
                    ? t('smart_review.note_mature')
                    : t('smart_review.note_middle');

            return {
                i,
                n,
                count,
                tag,
                tagColor,
                note,
                barWidth: `${((count / peak) * 100).toFixed(1)}%`,
                barClass: n === 1 ? 'bg-st-primary' : last ? 'bg-st-accent' : 'bg-st-ink-300',
                chipClass:
                    n === 1
                        ? 'border-st-primary bg-st-primary-soft text-st-primary'
                        : last
                        ? 'border-st-jade-600 bg-st-accent-soft text-st-jade-600'
                        : 'border-st-ink-300 bg-st-card text-st-muted',
            };
        });
    });

    function getItemCount(index: number): number {
        return props.stats?.distribution[String(index + 1)] || 0;
    }

    /** Number inputs emit strings; keep the model numeric and inside the field's range. */
    function clamp(value: string | number, lo: number, hi: number): number {
        const n = Number(value);
        return Math.max(lo, Math.min(hi, isNaN(n) ? lo : n));
    }

    function adjustArrays() {
        const targetLen = localSettings.value.totalBoxes;

        // Ensure arrays exist
        if (!localSettings.value.boxIntervals) localSettings.value.boxIntervals = [];
        if (!localSettings.value.boxQuotas) localSettings.value.boxQuotas = [];

        const currentIntervals = localSettings.value.boxIntervals;
        const currentQuotas = localSettings.value.boxQuotas;

        // Resize Intervals
        if (currentIntervals.length < targetLen) {
            for (let i = currentIntervals.length; i < targetLen; i++) {
                // Default logic: double previous or 1
                const prev = i > 0 ? currentIntervals[i - 1] : 1;
                currentIntervals.push(prev * 2);
            }
        } else if (currentIntervals.length > targetLen) {
            localSettings.value.boxIntervals = currentIntervals.slice(0, targetLen);
        }

        // Resize Quotas
        if (currentQuotas.length < targetLen) {
            for (let i = currentQuotas.length; i < targetLen; i++) {
                currentQuotas.push(5); // Default quota
            }
        } else if (currentQuotas.length > targetLen) {
            localSettings.value.boxQuotas = currentQuotas.slice(0, targetLen);
        }
    }

    /** Discard restores what was fetched, NOT the component's hardcoded defaults. */
    function discard() {
        const saved = props.stats?.settings;
        if (!saved) return;
        localSettings.value = JSON.parse(JSON.stringify(saved));
        adjustArrays();
        saveFailed.value = false;
        nextTick(() => {
            settingsDirty.value = false;
            changed.value = {};
        });
    }

    async function performSave() {
        loading.value = true;
        try {
            await functionProvider.run({
                name: 'update-settings',
                args: {
                    userId: authUser.value?.id,
                    settings: localSettings.value,
                },
            });
            saveFailed.value = false;
            settingsDirty.value = false;
            changed.value = {};
            emit('saved');
        } catch (e) {
            console.error(e);
            saveFailed.value = true;
            toastError(t('smart_review.failed_save'));
        } finally {
            loading.value = false;
        }
    }

    async function performReset() {
        resetting.value = true;
        try {
            await functionProvider.run({
                name: 'reset-system',
                args: {
                    userId: authUser.value?.id,
                },
            });
            resetOpen.value = false;
            openLevel.value = null;
            emit('reset');
            toastSuccess(t('smart_review.system_reset_success'));
        } catch (e) {
            console.error(e);
            toastError(t('smart_review.failed_reset'));
        } finally {
            resetting.value = false;
        }
    }
</script>
