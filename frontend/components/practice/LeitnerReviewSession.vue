<template>
	<MaterialPracticeToolScaffold :title="title" :activePhrase="currentIndex + 1" :totalPhrases="totalItems"
		bundleId="leitner" @end-session="$emit('end-session')">
		<div v-if="loading" class="flex h-full w-full items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
		</div>

		<div v-else-if="items.length === 0"
			class="flex h-full w-full flex-col items-center justify-center p-8 text-center">
			<Icon name="iconify solar--confetti-bold-duotone" class="mb-4 text-6xl text-success-500" />
			<h2 class="text-2xl font-bold">{{ $t('board.all_caught_up') }}</h2>
			<Button class="mt-6" @click="$emit('end-session')" variant="soft">{{ $t('board.back_to_board') }}</Button>
		</div>

		<div v-else class="flex h-full w-full flex-col items-center p-5 md:px-16 md:py-14">
			<!-- Fixed height (viewport units) so the card never resizes when flipping between
			     front/back; long content scrolls inside the card instead of growing the page. -->
			<div
				:class="['h-[58vh] w-full transition-all duration-300 ease-in-out', 'md:max-w-[80%]', 'lg:max-w-[65%]']">
				<Transition name="fade-slide" mode="out-in">
					<WidgetFlashCard v-if="currentPhrase" :key="currentIndex" ref="flashCardRef"
						:phrase="currentPhrase" :leitner-level="cardLevel" />
				</Transition>
			</div>

			<!-- Leitner Controls -->
			<section class="my-10 flex w-full max-w-2xl items-center justify-center gap-6">
				<div class="flex flex-col items-center gap-3">
					<Button @click="submitResult(false)" color="danger" :outline="true" rounded="lg" size="lg"
						class="group flex h-12 w-40 items-center justify-center gap-3 px-6 shadow-sm transition-all hover:scale-[1.02] active:scale-95">
						<template #icon>
							<Icon name="iconify solar--close-circle-bold-duotone"
								class="h-5 w-5 transition-transform group-hover:rotate-12" />
						</template>
						<span class="text-sm font-bold tracking-wide">{{ $t('smart_review.forgot') }}</span>
					</Button>
					<div class="text-[10px] font-bold uppercase tracking-widest text-gray-400">
						{{ $t('smart_review.press_key_or_key', { key1: '←', key2: '1' }) }}
					</div>
				</div>

				<div class="flex flex-col items-center gap-3">
					<Button @click="submitResult(true)" color="success" :outline="true" rounded="lg" size="lg"
						class="group flex h-12 w-40 items-center justify-center gap-3 px-6 shadow-sm transition-all hover:scale-[1.02] active:scale-95">
						<template #icon>
							<Icon name="iconify solar--check-circle-bold-duotone"
								class="h-5 w-5 transition-transform group-hover:-rotate-12" />
						</template>
						<span class="text-sm font-bold tracking-wide">{{ $t('smart_review.learned') }}</span>
					</Button>
					<div class="text-[10px] font-bold uppercase tracking-widest text-gray-400">
						{{ $t('smart_review.press_key_or_key', { key1: '→', key2: '2' }) }}
					</div>
				</div>
			</section>
			<div class="mt-4 flex items-center gap-2 text-[11px] font-medium text-gray-400">
				{{ $t('smart_review.press_space_to_flip') }}
			</div>
		</div>
	</MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
import { Button, Icon } from 'pilotui/elements';
import { type PhraseType, type LeitnerItemType } from '~/types/database.type';

const props = defineProps<{
	items: LeitnerItemType[];
	loading: boolean;
	title: string;
}>();

const emit = defineEmits<{
	(e: 'submit-result', phraseId: string, isCorrect: boolean): void;
	(e: 'end-session'): void;
}>();

const currentIndex = ref(0);
const flashCardRef = ref(null);

const currentItem = computed(() => props.items[currentIndex.value]);
const currentPhrase = computed(() => currentItem.value?.phrase as PhraseType);
const totalItems = computed(() => props.items.length);

// Leitner level drives the L3+ cloze. get-review-session returns raw Mongoose docs, so schema fields
// like boxLevel sit under `_doc` rather than at the top level — read both so the level is found either way.
const cardLevel = computed<number | undefined>(() => {
	const item = currentItem.value as any;
	return item?.boxLevel ?? item?._doc?.boxLevel;
});

onMounted(() => {
	window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
	window.removeEventListener('keydown', handleKeyDown);
});

function handleKeyDown(event: KeyboardEvent) {
	if (props.loading || props.items.length === 0) return;

	// Don't hijack typing: while the cloze answer input (or any field) is focused, let keys through.
	const target = event.target as HTMLElement | null;
	if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
		return;
	}

	switch (event.code) {
		case 'Space':
			event.preventDefault();
			// @ts-ignore
			flashCardRef.value?.flipCard();
			break;
		case 'ArrowLeft':
		case 'Digit1':
		case 'Numpad1':
			submitResult(false);
			break;
		case 'ArrowRight':
		case 'Digit2':
		case 'Numpad2':
			submitResult(true);
			break;
	}
}

function submitResult(isCorrect: boolean) {
	if (!currentPhrase.value) return;

	emit('submit-result', currentPhrase.value._id, isCorrect);

	if (currentIndex.value < totalItems.value - 1) {
		currentIndex.value++;
	} else {
		emit('end-session');
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
