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
			<div
				:class="['w-full flex-1 transition-all duration-300 ease-in-out', 'md:max-h-[80%] md:max-w-[80%]', 'lg:max-h-[65%] lg:max-w-[65%]']">
				<!-- Use WidgetFlashCard based on phrase type -->
				<Transition name="fade-slide" mode="out-in">
					<WidgetFlashCard v-if="currentPhrase && currentPhrase.type === 'normal'"
						:key="`normal-${currentIndex}`" ref="flashCardRef" :phrase-type="'normal'"
						:front="currentPhrase.phrase" :back="currentPhrase.translation" :context="currentPhrase.context"
						:translation-language="currentPhrase.translation_language" />

					<WidgetFlashCard v-else-if="currentPhrase && currentPhrase.type === 'linguistic'"
						:key="`linguistic-${currentIndex}`" ref="flashCardRef" :phrase-type="'linguistic'"
						:front="currentPhrase.phrase"
						:back="currentPhrase.linguistic_data?.definition || currentPhrase.phrase"
						:context="currentPhrase.context" :direction="currentPhrase.direction"
						:language-info="currentPhrase.language_info" :linguistic-data="currentPhrase.linguistic_data" />

					<WidgetFlashCard v-else-if="currentPhrase" :key="`fallback-${currentIndex}`" ref="flashCardRef"
						:front="currentPhrase.phrase" :back="currentPhrase.translation || 'No translation'" />
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
						<span class="text-sm font-bold tracking-wide">Forgot</span>
					</Button>
					<div class="text-[10px] font-bold uppercase tracking-widest text-gray-400">Press
						<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-500 shadow-sm">←</span>
						or 1
					</div>
				</div>

				<div class="flex flex-col items-center gap-3">
					<Button @click="submitResult(true)" color="success" :outline="true" rounded="lg" size="lg"
						class="group flex h-12 w-40 items-center justify-center gap-3 px-6 shadow-sm transition-all hover:scale-[1.02] active:scale-95">
						<template #icon>
							<Icon name="iconify solar--check-circle-bold-duotone"
								class="h-5 w-5 transition-transform group-hover:-rotate-12" />
						</template>
						<span class="text-sm font-bold tracking-wide">Learned</span>
					</Button>
					<div class="text-[10px] font-bold uppercase tracking-widest text-gray-400">Press
						<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-500 shadow-sm">→</span>
						or 2
					</div>
				</div>
			</section>
			<div class="mt-4 flex items-center gap-2 text-[11px] font-medium text-gray-400">
				Press
				<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-500 shadow-sm">Space</span>
				<span>to flip the card</span>
			</div>
		</div>
	</MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
import { Button, Icon } from '@codebridger/lib-vue-components/elements.ts';
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

onMounted(() => {
	window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
	window.removeEventListener('keydown', handleKeyDown);
});

function handleKeyDown(event: KeyboardEvent) {
	if (props.loading || props.items.length === 0) return;

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
