<template>
    <section class="p-4">
        <Card class="shadow-none">
            <!-- Bundle Selection -->
            <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ t('bundle.select_bundle') }}
                </label>
                <select
                    v-model="formData.bundleId"
                    class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                    <option v-for="bundle in bundleList" :key="bundle._id" :value="bundle._id">
                        {{ bundle.title }}
                    </option>
                </select>
            </div>
            <section v-if="bundleList.length" class="mt-4">
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
                <Button color="primary" :disabled="!isFormValid" @click="startSession" :label="t('live-practice.start')" />
            </section>
        </Card>
    </section>
</template>

<script setup lang="ts">
    import { Button, Input, Card } from '@codebridger/lib-vue-components/elements.ts';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';

    const bundleList = ref<PhraseBundleType[]>([]);
    const filter = ref('');

    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('live-session.start-new-session'),
        middleware: ['auth'],
    });

    const controller = dataProvider.list<PhraseBundleType>(
        {
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.PHRASE_BUNDLE,
            query: {
                refId: authUser.value?.id,
                title: {
                    $regex: filter.value,
                    $options: 'i',
                },
            },
            options: {
                sort: {
                    _id: -1,
                },
            },
        },
        {
            limit: 50,
            page: 1,
            onFetched: (data) => {
                bundleList.value = data;
                // Select first bundle by default if available
                if (data.length > 0 && !formData.bundleId) {
                    formData.bundleId = data[0]._id;
                }
            },
        }
    );

    onMounted(async () => {
        try {
            // update pagination
            await controller.updatePagination();
            // fetch first page
            await controller.fetchPage(1);
        } catch (error) {
            console.error(error);
        }
    });

    const emit = defineEmits<{
        start: [data: LivePracticeSessionSetupType];
    }>();

    const aiCharacters = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

    const formData = reactive({
        bundleId: '',
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
        if (!formData.bundleId) return false;

        if (formData.selectionMode === 'selection') {
            return !selectionError.value;
        } else {
            return !randomError.value;
        }
    });

    function startSession() {
        if (!isFormValid.value) return;

        const sessionData = {
            bundleId: formData.bundleId,
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
    }
</script>
