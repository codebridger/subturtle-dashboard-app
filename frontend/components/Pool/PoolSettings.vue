<template>
	<div class="flex flex-col gap-6">
		<p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('pool.settings_desc') }}</p>

		<!-- Age cut-off -->
		<div class="flex items-center justify-between gap-4">
			<div>
				<div class="font-bold text-gray-900 dark:text-white">{{ $t('pool.age_cutoff') }}</div>
				<p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('pool.age_cutoff_desc') }}</p>
			</div>
			<div class="flex items-center gap-2">
				<input v-model.number="local.poolAgeCutoffDays" type="number" min="1" max="90"
					class="form-input w-24 rounded-lg border-gray-200 bg-gray-50 py-2 px-3 text-sm font-bold text-center focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700 transition-all" />
				<span class="text-xs font-bold uppercase text-gray-400">{{ $t('smart_review.days') }}</span>
			</div>
		</div>

		<!-- Chunk size -->
		<div class="flex items-center justify-between gap-4">
			<div>
				<div class="font-bold text-gray-900 dark:text-white">{{ $t('pool.chunk_size') }}</div>
				<p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('pool.chunk_size_desc') }}</p>
			</div>
			<div class="flex items-center gap-2">
				<input v-model.number="local.poolChunkSize" type="number" min="1" max="100"
					class="form-input w-24 rounded-lg border-gray-200 bg-gray-50 py-2 px-3 text-sm font-bold text-center focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700 transition-all" />
				<span class="text-xs font-bold uppercase text-gray-400">{{ $t('smart_review.items') }}</span>
			</div>
		</div>

		<!-- Daily review time (shared with Smart Review) -->
		<div class="flex items-center justify-between gap-4">
			<div>
				<div class="font-bold text-gray-900 dark:text-white">{{ $t('pool.daily_review_time') }}</div>
				<p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('pool.daily_review_time_desc') }}</p>
			</div>
			<HourSelector v-model="local.reviewHour" />
		</div>

		<div class="flex items-center justify-end gap-3 pt-2">
			<span class="text-xs font-medium" :class="dirty ? 'text-warning' : 'text-gray-400'">
				{{ dirty ? $t('smart_review.unsaved_changes') : $t('smart_review.settings_synced') }}
			</span>
			<Button color="primary" :disabled="!dirty || saving" :is-loading="saving" @click="save">
				{{ $t('pool.save') }}
			</Button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button } from 'pilotui/elements';
import { toastSuccess, toastError } from 'pilotui/toast';
import HourSelector from '~/components/material/HourSelector.vue';
import { functionProvider } from '@modular-rest/client';
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const profileStore = useProfileStore();
const { authUser } = storeToRefs(profileStore);

const props = defineProps<{
	stats: any;
}>();

const emit = defineEmits<{ (e: 'saved'): void }>();

const local = ref({ poolAgeCutoffDays: 7, poolChunkSize: 10, reviewHour: 9 });
const dirty = ref(false);
const saving = ref(false);

// Seed from the merged settings whenever they load/refresh.
watch(
	() => props.stats,
	(newVal) => {
		if (newVal?.settings) {
			local.value = {
				poolAgeCutoffDays: newVal.settings.poolAgeCutoffDays ?? 7,
				poolChunkSize: newVal.settings.poolChunkSize ?? 10,
				reviewHour: newVal.settings.reviewHour ?? 9,
			};
			dirty.value = false;
		}
	},
	{ immediate: true, deep: true }
);

watch(local, () => { dirty.value = true; }, { deep: true });

async function save() {
	saving.value = true;
	try {
		await functionProvider.run({
			name: 'update-settings',
			args: { userId: authUser.value?.id, settings: local.value },
		});
		dirty.value = false;
		toastSuccess(t('pool.saved_ok'));
		emit('saved');
	} catch (e: any) {
		console.error(e);
		toastError(e?.error || e?.message || t('pool.save_failed'));
	} finally {
		saving.value = false;
	}
}
</script>
