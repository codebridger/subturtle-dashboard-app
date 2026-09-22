<template>
	<MaterialPracticeToolScaffold :title="title" :activePhrase="currentIndex + 1" :totalPhrases="totalItems"
		bundleId="pool" @end-session="$emit('end-session')">
		<div v-if="loading" class="flex h-full w-full items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
		</div>

		<div v-else-if="items.length === 0"
			class="flex h-full w-full flex-col items-center justify-center p-8 text-center">
			<Icon name="iconify solar--confetti-bold-duotone" class="mb-4 text-6xl text-success-500" />
			<h2 class="text-2xl font-bold">{{ $t('pool.session_complete') }}</h2>
			<Button class="mt-6" @click="$emit('end-session')" variant="soft">{{ $t('board.back_to_board') }}</Button>
		</div>

		<div v-else class="flex h-full w-full flex-col items-center p-5 md:px-16 md:py-14">
			<!-- Progress dots: fill in as items complete, persistent through the session. -->
			<div class="mb-6 flex flex-wrap items-center justify-center gap-2">
				<span v-for="(item, i) in items" :key="i"
					class="h-2.5 w-2.5 rounded-full transition-all duration-300"
					:class="i < currentIndex ? 'bg-primary' : i === currentIndex ? 'bg-primary/40 ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-900' : 'bg-gray-200 dark:bg-gray-700'" />
			</div>

			<div :class="['h-[58vh] w-full transition-all duration-300 ease-in-out', 'md:max-w-[80%]', 'lg:max-w-[65%]']">
				<Transition name="fade-slide" mode="out-in">
					<PoolReviewItem v-if="currentPhrase" :key="currentIndex" ref="itemRef" :phrase="currentPhrase" />
				</Transition>
			</div>

			<!-- Encode controls — this is a first encounter, not a graded review, so there
			     is no Learned/Forgot: reveal the answer, then continue. -->
			<section class="my-10 flex w-full max-w-2xl items-center justify-center gap-6">
				<Button color="secondary" :outline="true" rounded="lg" size="lg"
					class="flex h-12 items-center justify-center gap-3 px-6" @click="reveal">
					<template #icon>
						<Icon name="iconify solar--eye-bold-duotone" class="h-5 w-5" />
					</template>
					<span class="text-sm font-bold tracking-wide">{{ $t('pool.reveal') }}</span>
				</Button>

				<Button color="primary" rounded="lg" size="lg"
					class="flex h-12 items-center justify-center gap-3 px-6" @click="next">
					<template #icon>
						<Icon name="iconify solar--arrow-right-bold-duotone" class="h-5 w-5" />
					</template>
					<span class="text-sm font-bold tracking-wide">
						{{ isLast ? $t('pool.finish') : $t('pool.next') }}
					</span>
				</Button>
			</section>
			<div class="mt-4 flex items-center gap-2 text-[11px] font-medium text-gray-400">
				{{ $t('smart_review.press_space_to_flip') }}
			</div>
		</div>
	</MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
import { Button, Icon } from 'pilotui/elements';
import { type PhraseType, type PoolItemType } from '~/types/database.type';

const props = defineProps<{
	items: PoolItemType[];
	loading: boolean;
	title: string;
}>();

const emit = defineEmits<{
	// Fired once the user works through the chunk; carries the encoded phrase IDs to promote.
	(e: 'complete', phraseIds: string[]): void;
	(e: 'end-session'): void;
}>();

const currentIndex = ref(0);
const itemRef = ref<any>(null);
const encoded = ref<string[]>([]);

const currentItem = computed(() => props.items[currentIndex.value]);
const currentPhrase = computed(() => currentItem.value?.phrase as PhraseType);
const totalItems = computed(() => props.items.length);
const isLast = computed(() => currentIndex.value >= totalItems.value - 1);

onMounted(() => window.addEventListener('keydown', handleKeyDown));
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));

function handleKeyDown(event: KeyboardEvent) {
	if (props.loading || props.items.length === 0) return;

	// Don't hijack typing in the cloze input.
	const target = event.target as HTMLElement | null;
	if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

	switch (event.code) {
		case 'Space':
			event.preventDefault();
			reveal();
			break;
		case 'Enter':
		case 'ArrowRight':
			next();
			break;
	}
}

function reveal() {
	itemRef.value?.flipCard();
}

function next() {
	const phrase = currentPhrase.value;
	if (phrase?._id) encoded.value.push(phrase._id);

	if (currentIndex.value < totalItems.value - 1) {
		currentIndex.value++;
	} else {
		emit('complete', [...encoded.value]);
	}
}
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
	transition: all 0.3s ease;
}

.fade-slide-enter-from {
	opacity: 0;
	transform: translateX(30px);
}

.fade-slide-leave-to {
	opacity: 0;
	transform: translateX(-30px);
}
</style>
