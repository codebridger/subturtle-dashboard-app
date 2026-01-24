<template>
    <div class="flex flex-col gap-6">
        <!-- Header / Total Boxes -->
        <Card class="rounded-lg border border-gray-100 shadow-sm dark:border-gray-700">
            <div class="flex flex-col gap-4 p-6">
                <div>
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">Leitner System Configuration</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Configure your spaced repetition journey. Items move down the chain as you learn them.
                    </p>
                </div>

                <div class="flex flex-col gap-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-200">Total Boxes</label>
                    <div class="flex items-center gap-4">
                        <input v-model.number="localSettings.totalBoxes" type="number" min="3" max="10"
                            class="form-input w-24 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                            @change="adjustArrays" />
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                            Changing this will resize your learning path.
                        </span>
                    </div>
                </div>
            </div>
        </Card>

        <div class="relative flex flex-col pt-4">
            <template v-for="(box, index) in localSettings.totalBoxes" :key="index">
                <!-- Content Row: Card + Centered Circle -->
                <div class="flex gap-6 items-stretch">
                    <!-- Visual Column: Centered Circle with Top/Bottom connectors -->
                    <div class="flex flex-col items-center w-12 min-w-[3rem]">
                        <!-- Top Line Segment: Connects circle to top of row. Hidden for first item. -->
                        <div class="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700" :class="{ 'invisible': index === 0 }">
                        </div>

                        <!-- The Circle -->
                        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl border-4 bg-white shadow-sm transition-all z-10 my-1"
                            :class="[
                                index === 0 ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400' : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400',
                                getItemCount(index) > 0 ? 'ring-4 ring-primary-50 dark:ring-primary-900/20' : ''
                            ]">
                            <span class="text-xs font-bold">{{ index + 1 }}</span>
                        </div>

                        <!-- Bottom Line Segment: Connects circle to bottom of row. Hidden for last item. -->
                        <div class="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700"
                            :class="{ 'invisible': index === localSettings.totalBoxes - 1 }"></div>
                    </div>

                    <!-- Card Content -->
                    <Card
                        class="flex-1 flex flex-col gap-4 rounded-lg border border-gray-100 p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
                        <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                            <div>
                                <h4 class="font-bold text-gray-900 dark:text-white">Box {{ index + 1 }}</h4>
                                <div class="flex items-center gap-2">
                                    <span class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                                        {{ getItemCount(index) }}
                                    </span>
                                    <span
                                        class="text-xs font-medium uppercase tracking-wide text-gray-500">Phrases</span>
                                </div>
                            </div>

                            <div class="flex flex-col gap-4 sm:flex-row">
                                <!-- Interval Input -->
                                <div class="flex flex-col gap-1">
                                    <label class="text-xs font-semibold text-gray-500">Review Interval</label>
                                    <div class="relative">
                                        <input v-model.number="localSettings.boxIntervals[index]" type="number" min="1"
                                            class="form-input w-24 rounded-md border-gray-300 py-1.5 pr-8 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700" />
                                        <span class="absolute right-2 top-1.5 text-xs text-gray-400">days</span>
                                    </div>
                                </div>

                                <!-- Quota Input -->
                                <div class="flex flex-col gap-1">
                                    <label class="text-xs font-semibold text-gray-500">Daily Quota</label>
                                    <div class="relative">
                                        <input v-model.number="localSettings.boxQuotas[index]" type="number" min="0"
                                            class="form-input w-24 rounded-md border-gray-300 py-1.5 pr-8 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700" />
                                        <span class="absolute right-2 top-1.5 text-xs text-gray-400">items</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                <!-- Gap Row used for spacing and continuous line -->
                <div v-if="index < localSettings.totalBoxes - 1" class="flex gap-6 h-8">
                    <!-- Visual Column with Line -->
                    <div class="flex justify-center w-12 min-w-[3rem]">
                        <div class="w-0.5 h-full bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                </div>
            </template>
        </div>

        <!-- Footer Actions -->
        <div
            class="sticky bottom-4 z-20 flex items-center justify-between rounded-xl border border-gray-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
            <!-- Reset Confirmation Modal -->
            <Modal title="Reset Leitner System">
                <template #trigger="{ toggleModal }">
                    <Button color="danger" variant="outline" size="sm" :disabled="loading" @click="toggleModal(true)">
                        Reset Progress
                    </Button>
                </template>
                <template #default>
                    <div class="p-4">
                        <p class="text-gray-700 dark:text-gray-300">
                            Are you sure you want to reset your entire Leitner system?
                            <br /><br />
                            <strong class="text-red-600">This action cannot be undone.</strong> All your progress, card
                            levels, and history will be wiped. You will start fresh.
                        </p>
                    </div>
                </template>
                <template #footer="{ toggleModal }">
                    <div class="flex justify-end gap-2">
                        <Button variant="outline" @click="toggleModal(false)">Cancel</Button>
                        <Button color="danger" :loading="resetting" @click="performReset(toggleModal)">Yes, Reset
                            Everything</Button>
                    </div>
                </template>
            </Modal>

            <!-- Save Confirmation Modal -->
            <Modal title="Save Preferences">
                <template #trigger="{ toggleModal }">
                    <Button color="primary" size="md" :loading="loading" @click="toggleModal(true)">
                        Save Preferences
                    </Button>
                </template>
                <template #default>
                    <div class="p-4">
                        <p class="text-gray-700 dark:text-gray-300">
                            Are you sure you want to save these changes?
                            <br /><br />
                            Changing intervals or the number of boxes may affect the scheduling of existing items.
                        </p>
                    </div>
                </template>
                <template #footer="{ toggleModal }">
                    <div class="flex justify-end gap-2">
                        <Button variant="outline" @click="toggleModal(false)">Cancel</Button>
                        <Button color="primary" :loading="loading" @click="performSave(toggleModal)">Yes, Save
                            Changes</Button>
                    </div>
                </template>
            </Modal>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { Button, Card } from '@codebridger/lib-vue-components/elements.ts';
import { Modal } from '@codebridger/lib-vue-components/complex.ts';
import { functionProvider } from '@modular-rest/client';
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';

interface Settings {
    dailyLimit: number;
    totalBoxes: number;
    boxIntervals: number[];
    boxQuotas: number[];
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

const loading = ref(false);
const resetting = ref(false);

// Default state
const localSettings = ref<Settings>({
    dailyLimit: 20,
    totalBoxes: 5,
    boxIntervals: [1, 2, 4, 8, 16],
    boxQuotas: [20, 10, 5, 5, 5],
});

// Sync props to local state
watch(
    () => props.stats,
    (newVal) => {
        if (newVal && newVal.settings) {
            // deep copy to avoid mutations prop warnings if object is shared
            localSettings.value = JSON.parse(JSON.stringify(newVal.settings));
            // Ensure arrays are filled if data is partial
            adjustArrays();
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
        emit('saved');
    } catch (e) {
        console.error(e);
        alert('Failed to save settings');
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
        alert('System has been reset.');
    } catch (e) {
        console.error(e);
        alert('Failed to reset system');
    } finally {
        resetting.value = false;
    }
}
</script>
