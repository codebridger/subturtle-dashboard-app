<template>
    <div class="h-full w-full cursor-pointer select-none" @click="flipCard">
        <Card :class="[!isFlipped ? 'bg-white' : 'bg-slate-100']" class="flex h-full items-center justify-center overflow-auto p-6">
            <!-- ========== NORMAL TYPE PHRASE PRESENTATION ========== -->
            <template v-if="phraseType === 'normal'">
                <div class="text-center">
                    <div class="mb-4 text-5xl font-medium">
                        <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                        <span v-else>{{ props.back || 'Back' }}</span>
                    </div>
                    <div class="text-lg text-gray-500">
                        <span v-if="!isFlipped">{{ props.context || '' }}</span>
                        <span v-else>{{ props.translationLanguage || '' }}</span>
                    </div>
                </div>
            </template>

            <!-- ========== LINGUISTIC TYPE PHRASE PRESENTATION ========== -->
            <template v-else-if="phraseType === 'linguistic'">
                <div class="relative h-full w-full max-w-4xl">
                    <!-- Front Side: Source phrase with phonetic -->
                    <template v-if="!isFlipped">
                        <div class="flex h-full flex-col">
                            <!-- Language code in corner -->
                            <div class="absolute right-4 top-4 rounded bg-gray-100 px-2 py-1 text-xs text-gray-400">
                                {{ props.languageInfo?.source || 'SRC' }}
                            </div>

                            <!-- Top empty div for spacing -->
                            <div class="flex-1"></div>

                            <!-- Center content div -->
                            <div class="flex flex-1 flex-col justify-center text-center">
                                <div class="mb-6 text-5xl font-medium" :dir="props.direction?.source || 'ltr'">
                                    {{ props.front || 'Front' }}
                                </div>

                                <!-- Phonetic Information in same row -->
                                <div v-if="props.linguisticData?.phonetic" class="flex items-center justify-center gap-6 text-gray-600">
                                    <div v-if="props.linguisticData.phonetic.ipa" class="font-mono text-lg">/{{ props.linguisticData.phonetic.ipa }}/</div>
                                    <div
                                        v-if="props.linguisticData.phonetic.transliteration"
                                        class="text-lg font-medium"
                                        :dir="props.direction?.target || 'ltr'"
                                    >
                                        {{ props.linguisticData.phonetic.transliteration }}
                                    </div>
                                </div>
                            </div>

                            <!-- Context div at bottom -->
                            <div class="flex flex-1 items-end justify-center pb-8">
                                <div v-if="props.context" class="max-w-2xl text-center text-sm italic text-gray-500" :dir="props.direction?.source || 'ltr'">
                                    {{ props.context }}
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- Back Side: Comprehensive linguistic information -->
                    <template v-else>
                        <div class="h-full w-full overflow-y-auto">
                            <div class="space-y-4 p-2">
                                <!-- Language code in corner -->
                                <div class="absolute right-4 top-4 rounded bg-gray-100 px-2 py-1 text-xs text-gray-400">
                                    {{ props.languageInfo?.target || 'TRG' }}
                                </div>

                                <!-- Translation Header -->
                                <div class="border-b border-gray-200 pb-4 text-center">
                                    <div class="mb-2 text-3xl font-bold" :dir="props.direction?.target || 'ltr'">
                                        {{ props.back || 'Translation' }}
                                    </div>

                                    <!-- Context moved here from front side -->
                                    <div
                                        v-if="props.context"
                                        class="mx-auto mt-2 max-w-2xl text-sm italic text-gray-600"
                                        :dir="props.direction?.source || 'ltr'"
                                    >
                                        "{{ props.context }}"
                                    </div>

                                    <!-- Type and Formality Badges -->
                                    <div class="mt-3 flex flex-wrap justify-center gap-2">
                                        <span
                                            v-if="props.linguisticData?.type"
                                            class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase text-blue-800"
                                        >
                                            {{ props.linguisticData.type }}
                                        </span>
                                        <span
                                            v-if="props.linguisticData?.formality_level"
                                            class="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase text-orange-800"
                                        >
                                            {{ props.linguisticData.formality_level }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Examples Section -->
                                <div v-if="props.linguisticData?.examples?.length" class="rounded-lg bg-gray-50 p-4">
                                    <div class="mb-3 text-sm font-bold text-gray-700">Examples</div>
                                    <div class="space-y-4">
                                        <div
                                            v-for="(example, index) in props.linguisticData.examples.slice(0, 2)"
                                            :key="index"
                                            class="rounded-lg border-l-4 border-blue-200 bg-white p-3"
                                        >
                                            <div class="mb-2 text-sm font-medium" :dir="props.direction?.target || 'ltr'">
                                                {{ example.target }}
                                            </div>
                                            <div class="text-xs text-gray-500" :dir="props.direction?.source || 'ltr'">
                                                {{ example.source }}
                                            </div>
                                        </div>
                                        <div v-if="props.linguisticData.examples.length > 2" class="text-center">
                                            <div class="text-xs text-gray-400">+{{ props.linguisticData.examples.length - 2 }} more examples</div>
                                        </div>
                                    </div>
                                </div>
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

    const props = withDefaults(defineProps<FlashCardProps>(), {
        phraseType: 'normal',
        front: 'Front',
        back: 'Back',
    });

    function flipCard() {
        isFlipped.value = !isFlipped.value;
    }

    // Reset flip state when phrase changes
    watch(
        () => props.front,
        () => {
            isFlipped.value = false;
        }
    );
</script>
