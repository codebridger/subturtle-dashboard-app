<template>
    <div class="flex flex-col gap-8 pb-20">
        <!-- Header / Stats Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
                class="p-4 bg-gradient-to-br from-primary-light to-white dark:from-primary-dark-light dark:to-gray-800 border-none shadow-sm overflow-hidden relative">
                <div class="relative">
                    <p class="text-xs font-bold text-primary uppercase tracking-wider">{{
                        $t('smart_review.total_progress') }}</p>
                    <h3 class="text-2xl font-black text-gray-900 dark:text-white">{{ stats?.totalItems || 0 }}</h3>
                    <p class="text-xs text-gray-500">{{ $t('smart_review.collected_phrases') }}</p>
                </div>
                <div class="absolute -right-4 -bottom-4 opacity-10 pointer-events-none">
                    <Icon name="IconFolder" class="!w-24 !h-24 text-primary" />
                </div>
            </Card>

            <Card
                class="p-4 bg-gradient-to-br from-success-light to-white dark:from-success-dark-light dark:to-gray-800 border-none shadow-sm overflow-hidden relative">
                <div class="relative">
                    <p class="text-xs font-bold text-success uppercase tracking-wider">{{
                        $t('smart_review.next_session') }}</p>
                    <h3 class="text-2xl font-black text-gray-900 dark:text-white">{{ localSettings.reviewHour }}:00</h3>
                    <p class="text-xs text-gray-500">{{ localSettings.reviewInterval === 1 ? $t('smart_review.daily') :
                        $t('smart_review.every_days_reminder', { days: localSettings.reviewInterval }) }} ({{
                            profileStore.userDetail?.timeZone || 'UTC' }})</p>
                </div>
                <div class="absolute -right-4 -bottom-4 opacity-10 pointer-events-none">
                    <Icon name="IconClock" class="!w-24 !h-24 text-success" />
                </div>
            </Card>

            <Card
                class="p-4 bg-gradient-to-br from-warning-light to-white dark:from-warning-dark-light dark:to-gray-800 border-none shadow-sm overflow-hidden relative">
                <div class="relative">
                    <p class="text-xs font-bold text-warning uppercase tracking-wider">{{
                        $t('smart_review.levels_active') }}</p>
                    <h3 class="text-2xl font-black text-gray-900 dark:text-white">{{ localSettings.totalBoxes }}</h3>
                    <p class="text-xs text-gray-500">{{ $t('smart_review.step_progression') }}</p>
                </div>
                <div class="absolute -right-4 -bottom-4 opacity-10 pointer-events-none">
                    <Icon name="IconArchive" class="!w-24 !h-24 text-warning" />
                </div>
            </Card>
        </div>

        <!-- Main Configuration Card -->
        <Card class="rounded-2xl border border-gray-100 shadow-sm dark:border-gray-700 relative">
            <!-- <div class="h-1.5 bg-gradient-to-r from-primary via-secondary to-primary-light"></div> -->
            <div class="flex flex-col gap-6 p-8">
                <div class="flex items-center gap-4">
                    <div class="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Icon name="IconSettings" class="!w-6 !h-6" />
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ $t('smart_review.settings') }}
                        </h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {{ $t('smart_review.settings_desc') }}
                        </p>
                    </div>
                </div>

                <div
                    class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <!-- Toggle: Auto Entry -->
                    <div class="flex items-center justify-between group">
                        <div class="flex flex-col gap-0.5">
                            <div class="flex items-center gap-2 mb-0.5">
                                <div class="flex items-center justify-center p-0.5">
                                    <Icon name="iconify solar--rocket-bold"
                                        class="text-primary opacity-50 !w-4 !h-4 shrink-0" />
                                </div>
                                <label class="font-bold text-gray-800 dark:text-gray-200 leading-none">{{
                                    $t('smart_review.auto_entry') }}</label>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">{{
                                $t('smart_review.auto_entry_desc') }}</p>
                        </div>
                        <Toggle v-model="localSettings.autoEntry" />
                    </div>

                    <!-- Input: Total Boxes -->
                    <div class="flex items-center justify-between group">
                        <div class="flex flex-col gap-0.5">
                            <div class="flex items-center gap-2 mb-0.5">
                                <div class="flex items-center justify-center p-0.5">
                                    <Icon name="iconify solar--layers-bold"
                                        class="text-primary opacity-50 !w-4 !h-4 shrink-0" />
                                </div>
                                <label class="font-bold text-gray-800 dark:text-gray-200 leading-none">
                                    {{ $t('smart_review.total_levels') }}
                                </label>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('smart_review.settings_desc') }}
                            </p>
                        </div>
                        <div class="relative">
                            <input v-model.number="localSettings.totalBoxes" type="number" min="1" max="10"
                                class="form-input w-24 rounded-lg border-gray-200 bg-gray-50 py-2 px-3 text-sm font-bold focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700 transition-all text-center" />
                        </div>
                    </div>

                    <!-- Input: Daily Limit -->
                    <div class="flex items-center justify-between group">
                        <div class="flex flex-col gap-0.5">
                            <div class="flex items-center gap-2 mb-0.5">
                                <div class="flex items-center justify-center p-0.5">
                                    <Icon name="IconChartSquare" class="text-primary opacity-50 !w-4 !h-4 shrink-0" />
                                </div>
                                <label class="font-bold text-gray-800 dark:text-gray-200 leading-none">{{
                                    $t('smart_review.global_daily_limit') }}</label>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('smart_review.max_phrases_desc')
                                }}</p>
                        </div>
                        <div class="relative">
                            <input v-model.number="localSettings.dailyLimit" type="number" min="1"
                                class="form-input w-24 rounded-lg border-gray-200 bg-gray-50 py-2 px-3 text-sm font-bold focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700 transition-all text-center" />
                        </div>
                    </div>

                    <!-- Input: Review Interval Group -->
                    <div class="flex items-center justify-between group relative flex-wrap">
                        <div class="flex flex-col gap-0.5">
                            <div class="flex items-center gap-2 mb-0.5">
                                <div class="flex items-center justify-center p-0.5">
                                    <Icon name="IconClock" class="text-primary opacity-50 !w-4 !h-4 shrink-0" />
                                </div>
                                <label class="font-bold text-gray-800 dark:text-gray-200 leading-none">{{
                                    $t('smart_review.review_interval') }}</label>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                {{ $t('smart_review.session_frequency_desc') }}
                                <br />
                                <span class="text-[10px] opacity-75">
                                    {{ $t('smart_review.based_on_local_time') }}
                                    (<NuxtLink to="/settings/profile"
                                        class="underline hover:text-primary transition-colors">
                                        {{ $t('smart_review.setup_timezone') }}
                                    </NuxtLink>)
                                </span>
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-gray-400 uppercase">{{ $t('smart_review.each') }}</span>
                            <input v-model.number="localSettings.reviewInterval" type="number" min="1"
                                class="form-input w-16 rounded-lg border-gray-200 bg-gray-50 py-2 px-2 text-sm font-bold focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700 transition-all text-center" />
                            <span class="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">{{
                                $t('smart_review.day_at') }}</span>
                            <HourSelector v-model="localSettings.reviewHour" />
                        </div>
                    </div>
                </div>
            </div>
        </Card>

        <!-- Vertical Flow Chain -->
        <div class="relative flex flex-col space-y-0 px-4 md:px-0">
            <template v-for="(box, index) in localSettings.totalBoxes" :key="index">
                <div class="relative flex gap-8 items-stretch">
                    <!-- Visual Progression Column -->
                    <div class="flex flex-col items-center w-12 pt-4">
                        <!-- Top Connection ( bridges the gap from previous row's bottom line) -->
                        <div v-if="index > 0"
                            class="h-4 w-1 bg-gradient-to-b from-gray-200/50 to-primary/30 dark:from-gray-700/50 dark:to-primary/50 -mt-4 mb-0">
                        </div>

                        <!-- Box Circle -->
                        <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 bg-white shadow-lg transition-all my-0"
                            :class="[
                                index === 0 ? 'border-primary text-primary dark:border-primary-400 dark:text-primary-400 ring-4 ring-primary/5' : 'border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500 dark:bg-gray-800',
                                getItemCount(index) > 0 ? 'bg-primary/5 border-primary/40' : ''
                            ]">
                            <!-- Pulse effect for non-empty boxes -->
                            <div v-if="getItemCount(index) > 0"
                                class="absolute inset-0 rounded-2xl bg-primary/20 animate-ping opacity-25"></div>
                            <span class="text-sm font-black">{{ index + 1 }}</span>
                        </div>

                        <!-- Progress Line Segment (Stretches to fill row height) -->
                        <div v-if="index < localSettings.totalBoxes - 1"
                            class="w-1 flex-1 bg-gradient-to-b from-primary/30 to-gray-200 dark:from-primary/50 dark:to-gray-700 rounded-full">
                        </div>
                    </div>

                    <!-- Box Card Content -->
                    <div class="flex-1 pb-12 group">
                        <Card
                            class="flex flex-col gap-4 rounded-2xl border border-gray-100 p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 dark:border-gray-700 dark:bg-gray-800/50 backdrop-blur-sm group-hover:bg-white dark:group-hover:bg-gray-800">
                            <div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                                <div class="flex items-center gap-4">
                                    <div
                                        class="h-14 w-14 rounded-2xl bg-gray-50 dark:bg-gray-700/50 flex flex-col items-center justify-center border border-gray-100 dark:border-gray-600">
                                        <span class="text-xl font-black text-primary">{{ getItemCount(index) }}</span>
                                        <span class="text-[10px] font-bold uppercase tracking-tighter text-gray-400">{{
                                            $t('smart_review.cards') }}</span>
                                    </div>
                                    <div>
                                        <h4
                                            class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                            {{ $t('smart_review.level_number', { number: index + 1 }) }}
                                            <span v-if="index === 0"
                                                class="px-1.5 py-0 rounded text-[9px] bg-primary/10 text-primary uppercase font-bold border border-primary/20">{{
                                                    $t('smart_review.entrance') }}</span>
                                            <span v-else-if="index === localSettings.totalBoxes - 1"
                                                class="px-1.5 py-0 rounded text-[9px] bg-success/10 text-success uppercase font-bold border border-success/20">{{
                                                    $t('smart_review.mature') }}</span>
                                        </h4>
                                        <p class="text-xs text-gray-500 dark:text-gray-400 italic">{{
                                            $t('smart_review.level_retention_desc', { number: index + 1 }) }}</p>
                                    </div>
                                </div>

                                <div class="flex flex-wrap gap-4 items-end">
                                    <!-- Interval -->
                                    <div class="flex flex-col gap-1.5">
                                        <label
                                            class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                            <Icon name="IconCalendar" class="!w-3 !h-3 shrink-0" />
                                            <span class="leading-none">{{ $t('smart_review.interval') }}</span>
                                        </label>
                                        <div class="relative group/input">
                                            <input v-model.number="localSettings.boxIntervals[index]" type="number"
                                                min="1"
                                                class="form-input w-24 rounded-lg border-gray-100 bg-gray-50/50 py-1.5 px-3 text-sm font-semibold focus:border-primary focus:bg-white transition-all dark:bg-gray-700 dark:border-gray-600" />
                                            <span
                                                class="absolute right-2 top-2 text-[10px] text-gray-400 pointer-events-none">{{
                                                    $t('smart_review.days') }}</span>
                                        </div>
                                    </div>

                                    <!-- Quota -->
                                    <div class="flex flex-col gap-1.5">
                                        <label
                                            class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                            <Icon name="IconBolt" class="!w-3 !h-3 shrink-0" />
                                            <span class="leading-none">{{ $t('smart_review.quota') }}</span>
                                        </label>
                                        <div class="relative group/input">
                                            <input v-model.number="localSettings.boxQuotas[index]" type="number" min="0"
                                                class="form-input w-24 rounded-lg border-gray-100 bg-gray-50/50 py-1.5 px-3 text-sm font-semibold focus:border-primary focus:bg-white transition-all dark:bg-gray-700 dark:border-gray-600" />
                                            <span
                                                class="absolute right-2 top-2 text-[10px] text-gray-400 pointer-events-none">{{
                                                    $t('smart_review.items') }}</span>
                                        </div>
                                    </div>

                                    <!-- Add Phrase Action -->
                                    <Button size="sm" variant="outline"
                                        class="h-[38px] px-4 rounded-lg border-primary/20 hover:border-primary text-primary transition-all active:scale-95 flex items-center gap-2"
                                        @click="openPicker(index + 1)">
                                        <template #icon>
                                            <Icon name="iconify solar--add-circle-bold" class="!w-4 !h-4" />
                                        </template>
                                        {{ $t('smart_review.manage') }}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </template>
        </div>

        <!-- Float Action Footer -->
        <div
            class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl flex items-center justify-between gap-4 rounded-2xl border border-white/20 bg-white/70 p-4 shadow-2xl backdrop-blur-xl dark:border-gray-700/30 dark:bg-gray-900/70">
            <div class="flex items-center gap-4 pl-2">
                <div v-if="settingsDirty" class="flex h-2 w-2 rounded-full bg-warning animate-pulse"></div>
                <div v-else class="flex h-2 w-2 rounded-full bg-success"></div>
                <span class="text-xs font-bold text-gray-600 dark:text-gray-400">
                    {{ settingsDirty ? $t('smart_review.unsaved_changes') : $t('smart_review.settings_synced') }}
                </span>
            </div>

            <div class="flex items-center gap-3">
                <Modal :title="$t('smart_review.reset_title')">
                    <template #trigger="{ toggleModal }">
                        <button
                            class="px-4 py-2 rounded-xl text-xs font-bold text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                            :disabled="loading || resetting" @click="toggleModal(true)">
                            {{ $t('smart_review.reset_progress') }}
                        </button>
                    </template>
                    <template #default>
                        <div class="p-4 flex flex-col items-center text-center gap-4">
                            <div
                                class="h-16 w-16 rounded-full bg-danger/10 flex items-center justify-center text-danger">
                                <Icon name="IconInfoTriangle" class="!w-8 !h-8" />
                            </div>
                            <div>
                                <h4 class="text-xl font-bold text-gray-900 dark:text-white">{{
                                    $t('smart_review.dangerous_action') }}</h4>
                                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                    {{ $t('smart_review.reset_confirm') }}
                                    <br />
                                    <strong class="text-danger">{{ $t('smart_review.reset_warning') }}</strong> {{
                                        $t('smart_review.settings_desc') }}
                                </p>
                            </div>
                        </div>
                    </template>
                    <template #footer="{ toggleModal }">
                        <div class="flex justify-end gap-3 w-full p-4 border-t dark:border-gray-700">
                            <Button variant="outline" :disabled="resetting" @click="toggleModal(false)">{{
                                $t('smart_review.keep_everything') }}</Button>
                            <Button color="danger" :is-loading="resetting" @click="performReset(toggleModal)">{{
                                $t('smart_review.confirm_wipe') }}</Button>
                        </div>
                    </template>
                </Modal>

                <Modal :title="$t('smart_review.confirm_save')">
                    <template #trigger="{ toggleModal }">
                        <Button color="primary" size="md" rounded="xl" :is-loading="loading"
                            :disabled="!settingsDirty || resetting"
                            class="shadow-lg shadow-primary/20 px-8 py-2.5 flex items-center gap-2"
                            @click="toggleModal(true)">
                            <template #icon>
                                <Icon name="IconSave" class="!w-4 !h-4" />
                            </template>
                            {{ $t('smart_review.save_preferences') }}
                        </Button>
                    </template>
                    <template #default>
                        <div class="p-4 flex flex-col items-center text-center gap-4">
                            <div
                                class="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Icon name="IconInfoCircle" class="!w-8 !h-8" />
                            </div>
                            <div>
                                <h4 class="text-xl font-bold text-gray-900 dark:text-white">{{
                                    $t('smart_review.review_changes') }}</h4>
                                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                    {{ $t('smart_review.save_confirm_desc') }}
                                </p>
                            </div>
                        </div>
                    </template>
                    <template #footer="{ toggleModal }">
                        <div class="flex justify-end gap-3 w-full p-4 border-t dark:border-gray-700">
                            <Button variant="outline" :disabled="loading" @click="toggleModal(false)">{{
                                $t('smart_review.go_back') }}</Button>
                            <Button color="primary" :is-loading="loading" @click="performSave(toggleModal)">{{
                                $t('smart_review.apply_now') }}</Button>
                        </div>
                    </template>
                </Modal>
            </div>
        </div>

        <!-- Phrase Picker Modal -->
        <LeitnerPhrasePicker v-model="showPicker" :target-box="pickingForBox" :total-boxes="localSettings.totalBoxes"
            @phrase-added="handlePhraseChange" @phrase-removed="handlePhraseChange" />
    </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { Button, Card, Icon } from '@codebridger/lib-vue-components/elements.ts';
import { Modal } from '@codebridger/lib-vue-components/complex.ts';
import { toastSuccess, toastError } from '@codebridger/lib-vue-components/toast.ts';
import LeitnerPhrasePicker from './LeitnerPhrasePicker.vue';
import Toggle from '~/components/material/Toggle.vue';
import HourSelector from '~/components/material/HourSelector.vue';
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

const showPicker = ref(false);
const pickingForBox = ref<number | null>(null);
const isDirty = ref(false); // Phrase changes dirty state
const settingsDirty = ref(false); // Settings configuration dirty state

function openPicker(boxLevel: number) {
    pickingForBox.value = boxLevel;
    showPicker.value = true;
    isDirty.value = false;
}

function handlePhraseChange() {
    isDirty.value = true;
}

watch(showPicker, (newVal, oldVal) => {
    // If modal was closed and something changed
    if (oldVal === true && newVal === false && isDirty.value) {
        emit('saved');
        isDirty.value = false;
    }
});

watch(() => localSettings.value.totalBoxes, () => {
    adjustArrays();
});

watch(localSettings, () => {
    settingsDirty.value = true;
}, { deep: true });

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
            }, 0);
        }
    },
    { immediate: true, deep: true }
);

function getItemCount(index: number): number {
    return props.stats?.distribution[String(index + 1)] || 0;
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

async function performSave(toggleModal: (state: boolean) => void) {
    loading.value = true;
    try {
        await functionProvider.run({
            name: 'update-settings',
            args: {
                userId: authUser.value?.id,
                settings: localSettings.value,
            },
        });
        toggleModal(false);
        settingsDirty.value = false;
        emit('saved');
    } catch (e) {
        console.error(e);
        toastError(t('smart_review.failed_save'));
    } finally {
        loading.value = false;
    }
}

async function performReset(toggleModal: (state: boolean) => void) {
    resetting.value = true;
    try {
        await functionProvider.run({
            name: 'reset-system',
            args: {
                userId: authUser.value?.id,
            },
        });
        toggleModal(false);
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
