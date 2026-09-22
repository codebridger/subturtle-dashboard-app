<template>
	<!-- First-encounter (encode) card: the source sentence with the confirmed chunk
	     blanked out as a fill-in. We reuse WidgetFlashCard and force the fill-in mode
	     (which it normally reserves for Leitner L3+) by passing leitner-level 3; when a
	     phrase has no usable chunk it falls back to the recognition card automatically. -->
	<WidgetFlashCard ref="flashCardRef" :phrase="phrase" :leitner-level="3" />
</template>

<script setup lang="ts">
import { type PhraseType } from '~/types/database.type';

defineProps<{
	phrase?: PhraseType | null;
}>();

const flashCardRef = ref<any>(null);

function flipCard() {
	flashCardRef.value?.flipCard();
}

defineExpose({ flipCard });
</script>
