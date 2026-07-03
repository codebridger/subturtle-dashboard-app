<template>
	<!-- Count-adaptive Pool card. Renders nothing when the pool is empty. -->
	<div v-if="poolCount > 0" class="group h-full">
		<Card
			class="relative h-full flex flex-col overflow-hidden rounded-[2.5rem] bg-white dark:bg-gray-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_40px_80px_rgba(var(--primary-rgb),0.15)] transition-all duration-700 hover:-translate-y-3 cursor-default p-0 border-0">

			<!-- Accent header -->
			<div class="h-32 w-full relative overflow-hidden shrink-0 rounded-t-[2rem]">
				<div
					class="absolute inset-0 bg-gradient-to-br from-secondary via-primary to-primary-dark opacity-100 group-hover:scale-110 transition-transform duration-1000">
				</div>
				<div
					class="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]">
				</div>
				<div class="absolute -left-6 -bottom-10 opacity-10 scale-150 group-hover:rotate-12 transition-transform duration-1000">
					<Icon name="iconify solar--inbox-archive-bold-duotone" class="w-32 h-32 text-white" />
				</div>
			</div>

			<!-- Content -->
			<div
				class="p-10 pb-12 flex flex-col flex-grow relative -mt-8 bg-white dark:bg-gray-800 rounded-t-[3rem] z-10 border-t border-white/10">
				<div class="absolute -top-12 left-10 h-24 w-24">
					<div
						class="h-24 w-24 bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl flex items-center justify-center border border-gray-50 dark:border-gray-800 ring-8 ring-white/10 dark:ring-gray-900/10 group-hover:scale-105 transition-transform duration-500">
						<Icon name="iconify solar--inbox-in-bold-duotone" class="text-4xl text-secondary" />
					</div>
				</div>

				<div class="mt-10 mb-8">
					<div class="flex items-center gap-2 mb-3">
						<span class="text-[10px] font-bold text-secondary uppercase tracking-widest">{{ $t('pool.module_label') }}</span>
						<div class="h-px flex-grow bg-gray-100 dark:bg-gray-700/50"></div>
					</div>
					<h3 class="text-2xl font-black text-gray-900 dark:text-white mb-3 tracking-tight group-hover:text-secondary transition-colors">
						{{ $t('pool.title') }}
					</h3>
					<p class="text-base font-medium text-gray-500 dark:text-gray-400 leading-relaxed flex items-center gap-2">
						<Icon name="iconify solar--layers-minimalistic-bold-duotone" class="w-5 h-5 opacity-60 shrink-0" />
						<span>{{ cardCopy }}</span>
					</p>
				</div>

				<!-- Actions -->
				<div class="mt-auto pt-8 flex flex-col gap-3">
					<Button @click="start()" block size="lg"
						class="h-16 rounded-2xl font-black bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-secondary dark:hover:bg-secondary hover:text-white dark:hover:text-white transition-all duration-300 active:scale-95 shadow-xl">
						<div class="flex items-center justify-center gap-3">
							<Icon name="iconify solar--play-circle-bold" class="w-6 h-6" />
							{{ $t('pool.start') }}
						</div>
					</Button>
					<Button v-if="poolCount > chunkSize" @click="doNext()" block size="lg" :outline="true" color="secondary"
						class="h-14 rounded-2xl font-bold">
						{{ $t('pool.do_next', { chunk: chunkSize }) }}
					</Button>
				</div>
			</div>
		</Card>
	</div>
</template>

<script setup lang="ts">
import { usePoolStore } from '~/stores/pool';
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';
import { Card, Button, Icon } from 'pilotui/elements';

const { t } = useI18n();
const router = useRouter();
const poolStore = usePoolStore();
const profileStore = useProfileStore();
const { poolCount } = storeToRefs(poolStore);
const { userDetail } = storeToRefs(profileStore);

// Chunk size for "Do the next N" — user-configurable on the profile (default 10).
const chunkSize = computed(() => (userDetail.value as any)?.poolChunkSize || 10);

// ~15s per word, matching the spec's examples (8 words ≈ 2 min, 23 words ≈ 6 min).
const estMinutes = computed(() => Math.max(1, Math.round(poolCount.value * 0.25)));

// Copy adapts to how big the backlog is (spec's four ranges; 0 renders no card).
const cardCopy = computed(() => {
	const count = poolCount.value;
	if (count <= 15) return t('pool.card_small', { count, mins: estMinutes.value });
	if (count <= 30) return t('pool.card_medium', { count, mins: estMinutes.value, chunk: chunkSize.value });
	return t('pool.card_large', { count, chunk: chunkSize.value });
});

function start() {
	poolStore.startSession();
	router.push('/practice/pool');
}

function doNext() {
	poolStore.startSession(chunkSize.value);
	router.push('/practice/pool');
}
</script>
