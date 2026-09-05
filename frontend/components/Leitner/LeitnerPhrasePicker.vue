<script setup lang="ts">
    import { ref, watch, computed, nextTick } from 'vue';
    import { functionProvider, dataProvider } from '@modular-rest/client';
    import { DATABASE, COLLECTIONS } from '~/types/database.type';
    import { useProfileStore } from '~/stores/profile';
    import { storeToRefs } from 'pinia';
    import { StButton, StInput, StSkeleton, StSwitch } from 'subturtle-ui';

    /**
     * The level's phrase manager. It used to be a modal opened from the level row; the redesign
     * makes it the inline panel underneath that row (one level open at a time), so `targetBox` is
     * the open level rather than a modal argument. Only the shell changed — the data logic
     * (picker metadata, the paged phrase query, add/remove) is as it was.
     */
    const props = defineProps<{
        targetBox: number | null;
        totalBoxes: number;
    }>();

    const emit = defineEmits(['phraseAdded', 'phraseRemoved']);

    const profileStore = useProfileStore();
    const { authUser } = storeToRefs(profileStore);
    const { t } = useI18n();

    const phrases = ref<any[]>([]);
    const bundles = ref<any[]>([]);
    const boxPhraseIds = ref<Set<string>>(new Set());
    const phraseToBoxMap = ref<Record<string, number>>({});
    const loading = ref(false);
    const totalPhrases = ref(0);
    const page = ref(1);
    const limit = ref(10);
    const search = ref('');
    const selectedBundleId = ref('');
    const activeBox = ref<number>(props.targetBox || 1);
    const pagination = ref<any>(null);
    const phraseFilterIds = ref<string[] | null>(null);
    const showOnlyInBox = ref(false);

    const totalPages = computed(() => Math.max(1, Math.ceil(totalPhrases.value / limit.value)));

    const controller = computed(() => {
        const query: any = {
            refId: authUser.value?.id,
            phrase: { $regex: search.value, $options: 'i' },
        };

        let resultIds: string[] | null = null;
        if (showOnlyInBox.value) {
            resultIds = Object.entries(phraseToBoxMap.value)
                .filter(([_, box]) => box === activeBox.value)
                .map(([id]) => id);
        }

        if (phraseFilterIds.value) {
            if (resultIds === null) {
                resultIds = phraseFilterIds.value;
            } else {
                const bundleIds = new Set(phraseFilterIds.value);
                resultIds = resultIds.filter((id) => bundleIds.has(id));
            }
        }

        if (resultIds !== null) {
            query._id = { $in: resultIds };
        }

        return dataProvider.list<any>(
            {
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE,
                query,
                options: {
                    sort: { createdAt: -1 },
                },
            },
            {
                limit: limit.value,
                page: page.value,
                onFetched: (items) => {
                    phrases.value = items || [];
                    pagination.value = controller.value.pagination;
                    totalPhrases.value = controller.value.pagination.total;
                },
            }
        );
    });

    async function loadPickerData() {
        try {
            const info = (await functionProvider.run({
                name: 'get-phrase-management-info',
                args: { userId: authUser.value?.id },
            })) as any;
            phraseToBoxMap.value = info?.phraseToBoxMap || {};
            boxPhraseIds.value = new Set(Object.keys(phraseToBoxMap.value));
            bundles.value = info?.bundles || [];
        } catch (e) {
            console.error('[Picker] Failed to load picker metadata', e);
        }
    }

    async function fetchPhrases() {
        loading.value = true;
        try {
            if (selectedBundleId.value) {
                const bundle = await dataProvider.findOne<any>({
                    database: DATABASE.USER_CONTENT,
                    collection: COLLECTIONS.PHRASE_BUNDLE,
                    query: { _id: selectedBundleId.value },
                } as any);
                phraseFilterIds.value = bundle?.phrases || [];
            } else {
                phraseFilterIds.value = null;
            }

            // Check for early empty result when filtering by box
            if (showOnlyInBox.value) {
                const boxIds = Object.entries(phraseToBoxMap.value)
                    .filter(([_, box]) => box === activeBox.value)
                    .map(([id]) => id);

                // If box is empty, or if we intersect and result is empty
                if (boxIds.length === 0 || (phraseFilterIds.value && boxIds.filter((id) => phraseFilterIds.value!.includes(id)).length === 0)) {
                    phrases.value = [];
                    totalPhrases.value = 0;
                    loading.value = false;
                    return;
                }
            }

            await nextTick(); // Ensure computed controller updates with new phraseFilterIds
            await controller.value.updatePagination();
            await controller.value.fetchPage(page.value);
        } catch (e) {
            console.error('[Picker] Failed to fetch phrases', e);
        } finally {
            loading.value = false;
        }
    }

    async function addPhrase(phraseId: string) {
        const pid = phraseId.toString();
        try {
            await functionProvider.run({
                name: 'add-phrase-to-box',
                args: {
                    userId: authUser.value?.id,
                    phraseId: pid,
                    boxLevel: activeBox.value,
                },
            });
            phraseToBoxMap.value[pid] = activeBox.value;
            boxPhraseIds.value.add(pid);
            emit('phraseAdded');
        } catch (e) {
            console.error('[Picker] Failed to add phrase', e);
        }
    }

    async function removePhrase(phraseId: string) {
        const pid = phraseId.toString();
        try {
            await functionProvider.run({
                name: 'remove-phrase-from-box',
                args: {
                    userId: authUser.value?.id,
                    phraseId: pid,
                },
            });
            delete phraseToBoxMap.value[pid];
            boxPhraseIds.value.delete(pid);
            emit('phraseRemoved');
        } catch (e) {
            console.error('[Picker] Failed to remove phrase', e);
        }
    }

    // The open level IS the target level now — following it replaces the modal's open-time reset.
    watch(
        () => props.targetBox,
        (box) => {
            if (!box) return;
            activeBox.value = box;
            search.value = '';
            selectedBundleId.value = '';
            showOnlyInBox.value = false;
            page.value = 1;
            loadPickerData();
            fetchPhrases();
        },
        { immediate: true }
    );

    watch([search, selectedBundleId, page, showOnlyInBox, activeBox], () => {
        fetchPhrases();
    });

    // Searching or re-filtering invalidates the current page number.
    watch([search, selectedBundleId, showOnlyInBox], () => {
        page.value = 1;
    });
</script>

<template>
    <div class="border-t border-st-line bg-st-sunken p-[18px]">
        <div class="mb-[14px] flex flex-wrap items-center gap-3">
            <span class="text-st-xs font-extrabold text-st-strong">
                {{ t('smart_review.phrases_in_level', { number: activeBox }) }}
            </span>
            <span class="flex-1"></span>

            <StInput v-model="search" icon="solar:magnifer-linear" :placeholder="t('smart_review.search_phrases_placeholder')" class="w-[210px]" />

            <!-- Native select: the design draws a pill that opens a bundle list, and the design
                 system ships no Select yet. Styled to match the Input beside it. -->
            <select
                v-model="selectedBundleId"
                class="h-control-md rounded-st-md border border-st-line bg-st-card px-3.5 text-st-xs font-bold text-st-body outline-none focus:border-st-primary"
            >
                <option value="">{{ t('smart_review.all_bundles') }}</option>
                <option v-for="bundle in bundles" :key="bundle._id" :value="bundle._id">
                    {{ bundle.title }}
                </option>
            </select>

            <StSwitch v-model="showOnlyInBox" size="sm" :label="t('smart_review.only_this_level')" class="text-st-xs font-bold text-st-muted" />
        </div>

        <div v-if="loading" class="flex flex-col gap-2">
            <StSkeleton v-for="n in 4" :key="n" class="h-[52px]" />
        </div>

        <p v-else-if="!phrases.length" class="py-8 text-center text-st-sm font-semibold text-st-muted">
            {{ t('smart_review.no_phrases_found') }}
        </p>

        <div v-else class="flex flex-col gap-2">
            <div
                v-for="phrase in phrases"
                :key="phrase._id"
                class="flex flex-wrap items-center gap-4 rounded-st-md border border-st-line bg-st-card px-3.5 py-[11px]"
            >
                <div class="min-w-0 flex-1">
                    <span class="text-st-sm font-extrabold text-st-strong">{{ phrase.phrase }}</span>
                    <span class="text-st-sm font-semibold text-st-muted"> — {{ phrase.translation }}</span>
                </div>

                <span class="flex-none rounded-st-pill bg-st-sunken px-[11px] py-1 text-st-2xs font-extrabold text-st-muted">
                    {{ phraseToBoxMap[phrase._id] ? t('smart_review.level_number', { number: phraseToBoxMap[phrase._id] }) : t('smart_review.not_in_chain') }}
                </span>

                <template v-if="phraseToBoxMap[phrase._id]">
                    <StButton v-if="phraseToBoxMap[phrase._id] !== activeBox" variant="soft" color="primary" size="sm" @click="addPhrase(phrase._id)">
                        {{ t('smart_review.move_to_level', { number: activeBox }) }}
                    </StButton>
                    <StButton v-else variant="ghost" color="danger" size="sm" @click="removePhrase(phrase._id)">
                        {{ t('smart_review.remove') }}
                    </StButton>
                </template>
                <StButton v-else variant="soft" color="primary" size="sm" @click="addPhrase(phrase._id)">
                    {{ t('smart_review.add_here') }}
                </StButton>
            </div>
        </div>

        <div class="mt-[14px] flex flex-wrap items-center justify-between gap-4">
            <span class="text-st-xs font-bold text-st-muted">
                {{ t('smart_review.total_phrases', { count: totalPhrases }) }}
            </span>
            <div class="flex items-center gap-2">
                <StButton variant="ghost" color="neutral" size="sm" :disabled="page <= 1" @click="page--">
                    {{ t('smart_review.previous') }}
                </StButton>
                <span class="text-st-xs font-extrabold text-st-body">
                    {{ t('smart_review.page_of', { page, total: totalPages }) }}
                </span>
                <StButton variant="ghost" color="neutral" size="sm" :disabled="page >= totalPages" @click="page++">
                    {{ t('smart_review.next') }}
                </StButton>
            </div>
        </div>
    </div>
</template>
