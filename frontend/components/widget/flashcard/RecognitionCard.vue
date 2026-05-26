<template>
    <!-- ========== NORMAL TYPE ========== -->
    <div v-if="props.phraseType === 'normal'" class="flex h-full flex-col">
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
        <div class="flex-1"></div>
        <!-- Center content -->
        <div class="flex flex-1 flex-col justify-center text-center">
            <div :class="isFlipped ? 'mb-3 text-2xl font-medium' : 'mb-6 text-5xl font-medium'">
                <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                <span v-else>{{ props.back || 'Back' }}</span>
            </div>
            <div v-if="!isFlipped" class="text-lg text-gray-500">
                <span>{{ props.context || '' }}</span>
            </div>
        </div>
        <div class="flex-1"></div>
    </div>

    <!-- ========== LINGUISTIC TYPE ========== -->
    <div v-else class="relative h-full w-full max-w-4xl">
        <!-- Front: source phrase with phonetic -->
        <template v-if="!isFlipped">
            <div class="flex h-full flex-col">
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
                <div class="flex-1"></div>
                <div class="flex flex-1 flex-col justify-center text-center">
                    <div class="mb-6 text-5xl font-medium" :dir="props.direction?.source || 'ltr'">
                        {{ props.front || 'Front' }}
                    </div>
                    <!-- Phonetic (transliteration only) -->
                    <div v-if="props.linguisticData?.phonetic?.transliteration"
                        class="flex items-center justify-center text-gray-600">
                        <div class="text-lg font-medium" :dir="props.direction?.target || 'ltr'">
                            {{ props.linguisticData.phonetic.transliteration }}
                        </div>
                    </div>
                </div>
                <!-- Context at bottom -->
                <div class="flex flex-1 items-end justify-center pb-8">
                    <div v-if="props.context" class="max-w-2xl text-center text-sm italic text-gray-500"
                        :dir="props.direction?.source || 'ltr'">
                        {{ props.context }}
                    </div>
                </div>
            </div>
        </template>

        <!-- Back: translation + per-chunk definitions -->
        <template v-else>
            <div class="relative flex h-full w-full flex-col items-center justify-center">
                <div class="flex w-full items-start justify-between px-6 pt-4">
                    <div class="flex min-w-0 flex-col items-start gap-1">
                        <template v-if="props.linguisticData?.type || props.linguisticData?.formality_level">
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
                            {{ props.languageInfo?.target || 'TRG' }}
                        </span>
                    </div>
                </div>

                <!-- Main content: translation + per-chunk definitions. Scroll-safe via my-auto. -->
                <div class="flex h-full w-full justify-center overflow-auto py-6">
                    <div class="my-auto flex w-full flex-col items-center gap-6">
                        <div class="text-center text-2xl font-medium" :dir="props.direction?.target || 'ltr'">
                            {{ props.back || 'Translation' }}
                        </div>

                        <div v-if="props.chunks?.length" class="w-full max-w-2xl space-y-3">
                            <div class="mb-1 text-center text-xs uppercase tracking-wide text-gray-400">Definition</div>
                            <div v-for="(chunk, index) in props.chunks" :key="index"
                                class="rounded-lg border-l-4 border-blue-200 bg-gray-50 p-3 text-left">
                                <div class="flex items-baseline justify-between gap-3">
                                    <span class="font-medium" :dir="props.direction?.source || 'ltr'">
                                        {{ chunk.text }}
                                    </span>
                                    <span v-if="chunk.transliteration" class="shrink-0 text-xs text-gray-400"
                                        :dir="props.direction?.target || 'ltr'">
                                        {{ chunk.transliteration }}
                                    </span>
                                </div>
                                <div v-if="chunk.definition" class="mt-1 text-sm text-gray-600"
                                    :dir="props.direction?.target || 'ltr'">
                                    {{ chunk.definition }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import type { LinguisticData, Chunk } from '~/types/database.type';

const props = defineProps<{
    phraseType?: 'normal' | 'linguistic';
    front?: string;
    back?: string;
    context?: string;
    translationLanguage?: string;
    direction?: { source: 'ltr' | 'rtl'; target: 'ltr' | 'rtl' };
    languageInfo?: { source: string; target: string };
    linguisticData?: LinguisticData;
    chunks?: Chunk[];
    isFlipped?: boolean;
}>();
</script>
