<template>
    <Modal :modelValue="modelValue" :title="t('live-practice.going-live')" @update:modelValue="$emit('update:modelValue', $event)">
        <div class="space-y-6">
            <!-- AI Character Selection -->
            <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ t('live-practice.ai-character') }}
                </label>
                <select
                    v-model="formData.aiCharacter"
                    class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                    <option v-for="character in aiCharacters" :key="character" :value="character">
                        {{ character.charAt(0).toUpperCase() + character.slice(1) }}
                    </option>
                </select>
            </div>

            <!-- Selection Tabs -->
            <div>
                <div class="mb-2 flex rounded-md bg-gray-100 p-1 dark:bg-gray-700">
                    <button
                        @click="formData.selectionMode = 'selection'"
                        :class="[
                            'flex-1 rounded-md py-2 text-center text-sm',
                            formData.selectionMode === 'selection'
                                ? 'bg-white font-medium text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                        ]"
                    >
                        {{ t('live-practice.selection') }}
                    </button>
                    <button
                        @click="formData.selectionMode = 'random'"
                        :class="[
                            'flex-1 rounded-md py-2 text-center text-sm',
                            formData.selectionMode === 'random'
                                ? 'bg-white font-medium text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                        ]"
                    >
                        {{ t('live-practice.random') }}
                    </button>
                </div>

                <!-- Selection mode options -->
                <div v-if="formData.selectionMode === 'selection'" class="space-y-4">
                    <div class="flex space-x-4">
                        <div class="flex-1">
                            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {{ t('live-practice.from-phrase') }}
                            </label>
                            <Input v-model="formData.fromPhrase" type="number" min="1" :max="formData.toPhrase" class="w-full" />
                        </div>
                        <div class="flex-1">
                            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {{ t('live-practice.to-phrase') }}
                            </label>
                            <Input v-model="formData.toPhrase" type="number" :min="formData.fromPhrase" class="w-full" />
                        </div>
                    </div>
                    <p v-if="selectionError" class="text-sm text-red-500">
                        {{ selectionError }}
                    </p>
                </div>

                <!-- Random mode options -->
                <div v-else class="space-y-4">
                    <div>
                        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ t('live-practice.total-phrases') }}
                        </label>
                        <Input v-model="formData.totalPhrases" type="number" min="1" max="30" class="w-full" />
                    </div>
                    <p v-if="randomError" class="text-sm text-red-500">
                        {{ randomError }}
                    </p>
                </div>
            </div>
        </div>

        <template #footer="{ toggleModal }">
            <div class="flex justify-end space-x-2">
                <Button @click="toggleModal(false)" :label="t('live-practice.cancel')" />
                <Button color="primary" :disabled="!isFormValid" @click="startSession" :label="t('live-practice.start')" />
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';
    import { Button, Input } from '@codebridger/lib-vue-components/elements.ts';

    const { t } = useI18n();

    const props = defineProps<{
        modelValue: boolean;
    }>();

    const emit = defineEmits<{
        'update:modelValue': [value: boolean];
        start: [
            data: {
                aiCharacter: string;
                selectionMode: 'selection' | 'random';
                fromPhrase?: number;
                toPhrase?: number;
                totalPhrases?: number;
            }
        ];
    }>();

    const aiCharacters = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

    const formData = reactive({
        aiCharacter: 'alloy',
        selectionMode: 'selection' as 'selection' | 'random',
        fromPhrase: '1',
        toPhrase: '10',
        totalPhrases: '10',
    });

    const selectionError = computed(() => {
        if (formData.selectionMode !== 'selection') return '';

        const fromPhrase = parseInt(formData.fromPhrase) || 0;
        const toPhrase = parseInt(formData.toPhrase) || 0;
        const total = toPhrase - fromPhrase + 1;

        if (total > 30) {
            return t('live-practice.max-30-phrases-error');
        }

        if (fromPhrase < 1 || toPhrase < 1) {
            return t('live-practice.positive-numbers-required');
        }

        if (fromPhrase > toPhrase) {
            return t('live-practice.from-less-than-to-error');
        }

        return '';
    });

    const randomError = computed(() => {
        if (formData.selectionMode !== 'random') return '';

        const totalPhrases = parseInt(formData.totalPhrases) || 0;

        if (!totalPhrases) {
            return t('live-practice.total-phrases-required');
        }

        if (totalPhrases > 30) {
            return t('live-practice.max-30-phrases-error');
        }

        if (totalPhrases < 1) {
            return t('live-practice.positive-numbers-required');
        }

        return '';
    });

    const isFormValid = computed(() => {
        if (formData.selectionMode === 'selection') {
            return !selectionError.value;
        } else {
            return !randomError.value;
        }
    });

    function startSession() {
        if (!isFormValid.value) return;

        const sessionData = {
            aiCharacter: formData.aiCharacter,
            selectionMode: formData.selectionMode,
        };

        if (formData.selectionMode === 'selection') {
            emit('start', {
                ...sessionData,
                fromPhrase: parseInt(formData.fromPhrase),
                toPhrase: parseInt(formData.toPhrase),
            });
        } else {
            emit('start', {
                ...sessionData,
                totalPhrases: parseInt(formData.totalPhrases),
            });
        }

        emit('update:modelValue', false);
    }
</script>
