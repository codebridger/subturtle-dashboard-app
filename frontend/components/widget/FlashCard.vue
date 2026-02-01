<template>
    <div class="h-full w-full cursor-pointer select-none" @click="flipCard">
        <Card :class="[!isFlipped ? 'bg-white' : 'bg-slate-100']"
            class="flex h-full items-center justify-center overflow-auto p-6">
            <!-- ========== NORMAL TYPE PHRASE PRESENTATION ========== -->
            <template v-if="phraseType === 'normal'">
                <div class="flex h-full flex-col">
                    <!-- Top row: (empty left), lang code badge right -->
                    <div class="flex w-full items-start justify-between px-6 pt-4">
                        <div></div>
                        <div v-if="isFlipped" class="flex flex-col items-end gap-1">
                            <div class="mb-0.5 pr-0.5 text-[10px] text-gray-400">Language</div>
                            <span
                                class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                                {{ props.translationLanguage || 'LANG' }}
                            </span>
                        </div>
                    </div>
                    <!-- Top empty div for spacing -->
                    <div class="flex-1"></div>
                    <!-- Center content div -->
                    <div class="flex flex-1 flex-col justify-center text-center">
                        <div :class="isFlipped ? 'mb-3 text-2xl font-medium' : 'mb-6 text-5xl font-medium'">
                            <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                            <span v-else>{{ props.back || 'Back' }}</span>
                        </div>
                        <div v-if="!isFlipped" class="text-lg text-gray-500">
                            <span>{{ props.context || '' }}</span>
                        </div>
                    </div>
                    <!-- Bottom empty div for spacing -->
                    <div class="flex-1"></div>
                </div>
            </template>

            <!-- ========== LINGUISTIC TYPE PHRASE PRESENTATION ========== -->
            <template v-else-if="phraseType === 'linguistic'">
                <div class="relative h-full w-full max-w-4xl">
                    <!-- Front Side: Source phrase with phonetic -->
                    <template v-if="!isFlipped">
                        <div class="flex h-full flex-col">
                            <!-- Top row: (empty left), lang code badge right -->
                            <div class="flex w-full items-start justify-between px-6 pt-4">
                                <div></div>
                                <div class="flex flex-col items-end gap-1">
                                    <div class="mb-0.5 pr-0.5 text-[10px] text-gray-400">Language</div>
                                    <span
                                        class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                                        {{ props.languageInfo?.source || 'SRC' }}
                                    </span>
                                </div>
                            </div>
                            <!-- Top empty div for spacing -->
                            <div class="flex-1"></div>
                            <!-- Center content div -->
                            <div class="flex flex-1 flex-col justify-center text-center">
                                <div class="mb-6 text-5xl font-medium" :dir="props.direction?.source || 'ltr'">
                                    {{ props.front || 'Front' }}
                                </div>
                                <!-- Phonetic Information in same row -->
                                <div v-if="props.linguisticData?.phonetic"
                                    class="flex items-center justify-center gap-6 text-gray-600">
                                    <div v-if="props.linguisticData.phonetic.ipa" class="font-mono text-lg">/{{
                                        props.linguisticData.phonetic.ipa }}/</div>
                                    <div v-if="props.linguisticData.phonetic.transliteration"
                                        class="text-lg font-medium" :dir="props.direction?.target || 'ltr'">
                                        {{ props.linguisticData.phonetic.transliteration }}
                                    </div>
                                </div>
                            </div>
                            <!-- Context div at bottom -->
                            <div class="flex flex-1 items-end justify-center pb-8">
                                <div v-if="props.context" class="max-w-2xl text-center text-sm italic text-gray-500"
                                    :dir="props.direction?.source || 'ltr'">
                                    {{ props.context }}
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- Back Side: Comprehensive linguistic information -->
                    <template v-else>
                        <div class="relative flex h-full w-full flex-col items-center justify-center">
                            <!-- Top row: badges (left, only for linguistic), lang code (right, always) -->
                            <div class="flex w-full items-start justify-between px-6 pt-4">
                                <div class="flex min-w-0 flex-col items-start gap-1">
                                    <template
                                        v-if="phraseType === 'linguistic' && (props.linguisticData?.type || props.linguisticData?.formality_level)">
                                        <div class="mb-0.5 pl-0.5 text-[10px] text-gray-400">Attributes</div>
                                        <div class="flex flex-wrap gap-2">
                                            <span v-if="props.linguisticData?.type"
                                                class="truncate rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase text-blue-800">
                                                {{ props.linguisticData.type }}
                                            </span>
                                            <span v-if="props.linguisticData?.formality_level"
                                                class="truncate rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase text-orange-800">
                                                {{ props.linguisticData.formality_level }}
                                            </span>
                                        </div>
                                    </template>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <div class="mb-0.5 pr-0.5 text-[10px] text-gray-400">Language</div>
                                    <span
                                        class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                                        {{ phraseType === 'linguistic' ? props.languageInfo?.target || 'TRG' :
                                        props.translationLanguage || 'LANG' }}
                                    </span>
                                </div>
                            </div>

                            <!-- Main Content (centered) -->
                            <div v-if="!showExamples" class="flex h-full w-full flex-col items-center justify-center">
                                <div class="mb-3 text-center text-2xl font-medium"
                                    :dir="props.direction?.target || 'ltr'">
                                    {{ props.back || 'Translation' }}
                                </div>
                            </div>

                            <!-- Examples Section (centered, only if toggled) -->
                            <div v-if="showExamples && props.linguisticData?.examples?.length"
                                class="flex h-full w-full flex-col items-center justify-center">
                                <div class="w-full max-w-2xl rounded-lg bg-gray-50 p-4">
                                    <div class="mb-3 text-center text-sm font-bold text-gray-700">Examples</div>
                                    <div class="space-y-4">
                                        <div v-for="(example, index) in props.linguisticData.examples" :key="index"
                                            class="rounded-lg border-l-4 border-blue-200 bg-white p-3">
                                            <div class="mb-2 text-sm font-medium"
                                                :dir="props.direction?.target || 'ltr'">
                                                {{ example.target }}
                                            </div>
                                            <div class="text-xs text-gray-500" :dir="props.direction?.source || 'ltr'">
                                                {{ example.source }}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Examples Toggle Button at bottom -->
                            <div class="absolute bottom-8 left-0 right-0 flex justify-center">
                                <button v-if="props.linguisticData?.examples?.length" @click.stop="toggleExamples"
                                    class="rounded px-2 py-1 text-sm font-medium text-blue-600 underline transition-colors hover:text-blue-800 focus:outline-none">
                                    {{
                                        showExamples
                                            ? 'Hide Examples'
                                            : `Show Examples${props.linguisticData?.examples?.length ? `
                                    (${props.linguisticData.examples.length})` : ''}`
                                    }}
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
            </template>

            <!-- ========== FALLBACK FOR UNKNOWN TYPE ========== -->
            <template v-else>
                <div class="text-center text-xl text-gray-500">
                    <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                    <span v-else>{{ props.back || 'Back' }}</span>
                </div>
            </template>
        </Card>
    </div>
</template>

<script setup lang="ts">
import { Card } from '@codebridger/lib-vue-components/elements.ts';
import type { LinguisticData } from '~/types/database.type';

// Define the props interface for better type safety
interface FlashCardProps {
    // Common props for both types
    front?: string;
    back?: string;
    phraseType?: 'normal' | 'linguistic';
    context?: string;

    // Normal type specific props
    translationLanguage?: string;

    // Linguistic type specific props
    direction?: {
        source: 'ltr' | 'rtl';
        target: 'ltr' | 'rtl';
    };
    languageInfo?: {
        source: string;
        target: string;
    };
    linguisticData?: LinguisticData;
}

const isFlipped = ref(false);
const showExamples = ref(false);

const props = withDefaults(defineProps<FlashCardProps>(), {
    phraseType: 'normal',
    front: 'Front',
    back: 'Back',
});

function flipCard() {
    isFlipped.value = !isFlipped.value;
}

function toggleExamples() {
    showExamples.value = !showExamples.value;
}

defineExpose({
    flipCard,
});

// Reset flip state when phrase changes
watch(
    () => props.front,
    () => {
        isFlipped.value = false;
        showExamples.value = false;
    }
);
</script>
