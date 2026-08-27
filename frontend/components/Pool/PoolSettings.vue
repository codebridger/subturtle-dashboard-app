<template>
	<Card class="rounded-2xl border border-gray-100 shadow-sm dark:border-gray-700">
		<div class="flex flex-col gap-8 p-8">
			<!-- Header -->
			<div class="flex items-center gap-4">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
					<Icon name="iconify solar--inbox-in-bold-duotone" class="!h-6 !w-6" />
				</div>
				<div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ $t('pool.settings') }}</h3>
					<p class="max-w-lg text-sm text-gray-500 dark:text-gray-400">{{ $t('pool.settings_desc') }}</p>
				</div>
			</div>

			<!-- Rows -->
			<div class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700/60 dark:border-gray-700/60">
				<!-- Age cut-off -->
				<div class="flex items-center justify-between gap-6 py-5">
					<div class="flex items-start gap-3">
						<Icon name="iconify solar--hourglass-line-duotone" class="mt-0.5 !h-5 !w-5 shrink-0 text-secondary/50" />
						<div>
							<div class="font-bold text-gray-800 dark:text-gray-200">{{ $t('pool.age_cutoff') }}</div>
							<p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('pool.age_cutoff_desc') }}</p>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<input v-model.number="local.poolAgeCutoffDays" type="number" min="1" max="90"
							class="form-input w-20 rounded-lg border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-bold transition-all focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700" />
						<span class="w-10 text-xs font-bold uppercase text-gray-400">{{ $t('smart_review.days') }}</span>
					</div>
				</div>

				<!-- Chunk size -->
				<div class="flex items-center justify-between gap-6 py-5">
					<div class="flex items-start gap-3">
						<Icon name="iconify solar--layers-minimalistic-bold-duotone" class="mt-0.5 !h-5 !w-5 shrink-0 text-secondary/50" />
						<div>
							<div class="font-bold text-gray-800 dark:text-gray-200">{{ $t('pool.chunk_size') }}</div>
							<p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('pool.chunk_size_desc') }}</p>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<input v-model.number="local.poolChunkSize" type="number" min="1" max="100"
							class="form-input w-20 rounded-lg border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-bold transition-all focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-gray-600 dark:bg-gray-700" />
						<span class="w-10 text-xs font-bold uppercase text-gray-400">{{ $t('smart_review.items') }}</span>
					</div>
				</div>

				<!-- Daily review time (shared with Smart Review) -->
				<div class="flex items-center justify-between gap-6 py-5">
					<div class="flex items-start gap-3">
						<Icon name="iconify solar--clock-circle-bold-duotone" class="mt-0.5 !h-5 !w-5 shrink-0 text-secondary/50" />
						<div>
							<div class="font-bold text-gray-800 dark:text-gray-200">{{ $t('pool.daily_review_time') }}</div>
							<p class="text-xs text-gray-500 dark:text-gray-400">{{ $t('pool.daily_review_time_desc') }}</p>
						</div>
					</div>
					<div class="shrink-0">
						<HourSelector v-model="local.reviewHour" />
					</div>
				</div>
			</div>

			<!-- Footer / save -->
			<div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-700/60">
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full" :class="dirty ? 'bg-warning animate-pulse' : 'bg-success'" />
					<span class="text-xs font-bold text-gray-500 dark:text-gray-400">
						{{ dirty ? $t('smart_review.unsaved_changes') : $t('smart_review.settings_synced') }}
					</span>
				</div>
				<Button color="primary" rounded="xl" :disabled="!dirty || saving" :is-loading="saving"
					class="px-8 shadow-lg shadow-primary/20" @click="save">
					<template #icon>
						<Icon name="IconSave" class="!h-4 !w-4" />
					</template>
					{{ $t('pool.save') }}
				</Button>
			</div>
		</div>
	</Card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button, Card, Icon } from 'pilotui/elements';
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
