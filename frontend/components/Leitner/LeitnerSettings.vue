<template>
    <div class="flex flex-col gap-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- General Settings -->
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-200">Total Boxes</label>
                    <input v-model.number="localSettings.totalBoxes" type="number" min="3" max="10"
                        class="form-input w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                        @change="adjustArrays" />
                    <span class="text-xs text-gray-500 dark:text-gray-400">Number of Leitner boxes (3-10). Reducing this
                        moves items to the new max box.</span>
                </div>
            </div>
        </div>

        <div class="border-t border-gray-200 py-4 dark:border-gray-700">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">Box Configuration</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            <th class="px-4 py-3">Box Level</th>
                            <th class="px-4 py-3">Review Interval (Days)</th>
                            <th class="px-4 py-3">Session Quota (Items)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(box, index) in localSettings.totalBoxes" :key="index"
                            class="border-b bg-white dark:border-gray-700 dark:bg-gray-800">
                            <td class="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-white">Box {{
                                index + 1 }}</td>
                            <td class="px-4 py-3">
                                <input v-model.number="localSettings.boxIntervals[index]" type="number" min="1"
                                    class="form-input w-24 rounded-md border-gray-300 py-1 text-sm dark:border-gray-600 dark:bg-gray-700" />
                            </td>
                            <td class="px-4 py-3">
                                <input v-model.number="localSettings.boxQuotas[index]" type="number" min="0"
                                    class="form-input w-24 rounded-md border-gray-300 py-1 text-sm dark:border-gray-600 dark:bg-gray-700" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="mt-2 text-xs text-gray-500">
                <strong>Interval:</strong> Days to wait before reviewing again. <br />
                <strong>Quota:</strong> Max items from this box to show in a daily session.
            </p>
        </div>

        <div class="flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-700">
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
import { Button } from '@codebridger/lib-vue-components/elements.ts';
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
    initialSettings?: Settings;
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
    () => props.initialSettings,
    (newVal) => {
        if (newVal) {
            // deep copy to avoid mutations prop warnings if object is shared
            localSettings.value = JSON.parse(JSON.stringify(newVal));
            // Ensure arrays are filled if data is partial
            adjustArrays();
        }
    },
    { immediate: true, deep: true }
);

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
