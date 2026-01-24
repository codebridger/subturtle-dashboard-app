<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import { functionProvider, dataProvider } from '@modular-rest/client';
import { DATABASE, COLLECTIONS } from '~/types/database.type';
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';
import { Button, Input } from '@codebridger/lib-vue-components/elements.ts';
import { Modal } from '@codebridger/lib-vue-components/complex.ts';
import Toggle from '~/components/material/Toggle.vue';

const props = defineProps<{
	targetBox: number | null;
	totalBoxes: number;
	modelValue: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'phraseAdded', 'phraseRemoved']);

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
const activeBox = ref<number>(1);
const pagination = ref<any>(null);
const phraseFilterIds = ref<string[] | null>(null);
const showOnlyInBox = ref(false);

const controller = computed(() => {
	const query: any = {
		refId: authUser.value?.id,
		phrase: { $regex: search.value, $options: 'i' }
	};

	if (showOnlyInBox.value) {
		const filteredIds = Object.entries(phraseToBoxMap.value)
			.filter(([_, box]) => box === activeBox.value)
			.map(([id]) => id);
		query._id = { $in: filteredIds };
	} else if (phraseFilterIds.value) {
		query._id = { $in: phraseFilterIds.value };
	}

	return dataProvider.list<any>(
		{
			database: DATABASE.USER_CONTENT,
			collection: COLLECTIONS.PHRASE,
			query,
			options: {
				sort: { createdAt: -1 }
			}
		},
		{
			limit: limit.value,
			page: page.value,
			onFetched: (items) => {
				phrases.value = items || [];
				pagination.value = controller.value.pagination;
				totalPhrases.value = controller.value.pagination.total;
			}
		}
	);
});

async function loadPickerData() {
	try {
		const info = await functionProvider.run({
			name: 'get-phrase-management-info',
			args: { userId: authUser.value?.id }
		}) as any;
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
		if (showOnlyInBox.value) {
			const filteredIds = Object.entries(phraseToBoxMap.value)
				.filter(([_, box]) => box === activeBox.value)
				.map(([id]) => id);

			if (filteredIds.length === 0) {
				phrases.value = [];
				totalPhrases.value = 0;
				loading.value = false;
				return;
			}
		}

		if (selectedBundleId.value) {
			const bundle = await dataProvider.findOne<any>({
				database: DATABASE.USER_CONTENT,
				collection: COLLECTIONS.PHRASE_BUNDLE,
				query: { _id: selectedBundleId.value }
			} as any);
			phraseFilterIds.value = bundle?.phrases || [];
		} else {
			phraseFilterIds.value = null;
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
				boxLevel: activeBox.value
			}
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
				phraseId: pid
			}
		});
		delete phraseToBoxMap.value[pid];
		boxPhraseIds.value.delete(pid);
		emit('phraseRemoved');
	} catch (e) {
		console.error('[Picker] Failed to remove phrase', e);
	}
}

watch(() => props.modelValue, (newVal) => {
	if (newVal) {
		activeBox.value = props.targetBox || 1;
		search.value = '';
		selectedBundleId.value = '';
		showOnlyInBox.value = false;
		loadPickerData();
		fetchPhrases();
	}
});

watch([search, selectedBundleId, page, showOnlyInBox, activeBox], () => {
	fetchPhrases();
});

watch(showOnlyInBox, (newVal) => {
	if (newVal) {
		selectedBundleId.value = '';
	}
});

function close() {
	emit('update:modelValue', false);
}
</script>

<template>
	<Modal :modelValue="modelValue" title="Select Phrase" @close="close" size="xl">
		<template #default>
			<div class="flex flex-col gap-4">
				<!-- Box Selector -->
				<div class="flex flex-wrap gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
					<span class="flex items-center text-sm font-semibold text-gray-500 mr-2">Target Box:</span>
					<button v-for="b in totalBoxes" :key="b" @click="activeBox = b" :class="[
						'px-4 py-1.5 rounded-full text-xs font-bold transition-all border',
						activeBox === b
							? 'bg-primary border-primary text-white shadow-md ring-2 ring-primary/20'
							: 'bg-white border-gray-200 text-gray-600 hover:border-primary-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
					]">
						Box {{ b }}
					</button>
				</div>

				<!-- Search & Filters -->
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
					<div class="flex-1">
						<Input v-model="search" iconName="IconSearch" placeholder="Search phrases..." class="w-full" />
					</div>

					<div class="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 p-1.5 px-3 rounded-lg border border-gray-100 dark:border-gray-700 transition-all"
						:class="{ 'bg-primary-50/50 border-primary-200 dark:bg-primary-900/10 dark:border-primary-800': showOnlyInBox }">
						<Toggle v-model="showOnlyInBox" :label="`Only Box ${activeBox}:`" />

						<div class="h-4 w-px bg-gray-200 dark:bg-gray-700"></div>

						<select v-model="selectedBundleId" :disabled="showOnlyInBox"
							class="rounded-md border-0 bg-transparent text-sm focus:ring-0 dark:text-white disabled:opacity-50 cursor-pointer">
							<option value="">All Bundles</option>
							<option v-for="bundle in bundles" :key="bundle._id" :value="bundle._id">
								{{ bundle.title }}
							</option>
						</select>
					</div>
				</div>

				<!-- Phrase List -->
				<div
					class="phrase-list-container h-[450px] overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-700 shadow-inner">
					<div v-if="loading" class="flex h-64 items-center justify-center">
						<span class="text-gray-500">Loading...</span>
					</div>
					<div v-else-if="phrases.length === 0" class="flex h-64 items-center justify-center">
						<span class="text-gray-500">No phrases found.</span>
					</div>
					<div v-else class="divide-y divide-gray-100 dark:divide-gray-700">
						<div v-for="phrase in phrases" :key="phrase._id"
							class="flex items-center justify-between p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
							<div class="flex-1 pr-4">
								<p class="font-bold text-gray-900 dark:text-white">{{ phrase.phrase }}</p>
								<p class="text-sm text-gray-500 dark:text-gray-400">{{ phrase.translation }}</p>
							</div>
							<div class="shrink-0 flex gap-2">
								<template v-if="phraseToBoxMap[phrase._id]">
									<Button v-if="phraseToBoxMap[phrase._id] !== activeBox" size="sm" variant="outline"
										@click="addPhrase(phrase._id)">
										Move to Box {{ activeBox }}
									</Button>
									<Button v-if="phraseToBoxMap[phrase._id] === activeBox" size="sm" variant="danger"
										@click="removePhrase(phrase._id)">
										Remove from Box {{ activeBox }}
									</Button>
								</template>
								<Button v-else size="sm" @click="addPhrase(phrase._id)">
									Add to Box {{ activeBox }}
								</Button>
							</div>
						</div>
					</div>
				</div>

				<!-- Pagination -->
				<div class="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-700">
					<span class="text-sm text-gray-500">Total: {{ totalPhrases }} phrases</span>
					<div class="flex gap-2">
						<Button size="sm" variant="secondary" :disabled="page <= 1" @click="page--">Previous</Button>
						<span class="flex items-center px-4 py-1 text-sm font-medium">Page {{ page }}</span>
						<Button size="sm" variant="secondary" :disabled="phrases.length < limit"
							@click="page++">Next</Button>
					</div>
				</div>
			</div>
		</template>
	</Modal>
</template>

<style scoped>
.phrase-list-container::-webkit-scrollbar {
	width: 6px;
}

.phrase-list-container::-webkit-scrollbar-track {
	background: transparent;
}

.phrase-list-container::-webkit-scrollbar-thumb {
	background: #e2e8f0;
	border-radius: 10px;
}

.dark .phrase-list-container::-webkit-scrollbar-thumb {
	background: #334155;
}

.phrase-list-container::-webkit-scrollbar-thumb:hover {
	background: #cbd5e1;
}

.dark .phrase-list-container::-webkit-scrollbar-thumb:hover {
	background: #475569;
}
</style>
