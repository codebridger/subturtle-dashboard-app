<template>
    <div>
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">{{ t('live-practice.coach.title') }}</h2>
                <p class="mt-1 text-st-base font-semibold text-st-muted">
                    {{ formData.mode === 'text' ? t('live-practice.coach.subtitle-text') : t('live-practice.coach.subtitle-voice') }}
                </p>
            </div>

            <StSegmentedControl
                :model-value="formData.mode === 'text' ? 'text' : 'voice'"
                :options="modeOptions"
                @update:model-value="(v) => (formData.mode = v as 'voice' | 'text')"
            />
        </div>

        <!-- Voice only — a text session has no spoken voice. -->
        <VoicePicker v-if="formData.mode !== 'text'" v-model="formData.aiCharacter" :voices="resolvedVoices" />

        <div class="my-6 h-px bg-st-line" />

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- Explanation language. "Auto" lets the coach take it from the bundle. -->
            <label class="block">
                <span class="mb-2 block text-st-base font-bold text-st-strong">{{ t('live-practice.fallback-label') }}</span>
                <span class="relative block">
                    <StIcon name="solar:global-linear" :size="20" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-st-faint" />
                    <select
                        v-model="formData.nativeLanguage"
                        class="st-focus-ring h-[52px] w-full appearance-none rounded-st-md border-[1.5px] border-st-line bg-st-card pl-[46px] pr-11 font-st-sans text-st-base font-bold text-st-strong transition duration-150 ease-out focus:border-st-primary"
                    >
                        <option value="auto">{{ t('live-practice.native-language-auto') }}</option>
                        <option v-for="lang in SUPPORTED_LANGUAGES" :key="lang.code" :value="lang.title">{{ lang.title }}</option>
                    </select>
                    <StIcon name="solar:alt-arrow-down-linear" :size="20" class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-st-faint" />
                </span>
            </label>

            <!-- Which phrases. A contiguous range, with the rough length it comes to. -->
            <div>
                <div class="mb-2 flex items-baseline justify-between gap-3">
                    <span class="text-st-base font-bold text-st-strong">{{ t('live-practice.phrases.title') }}</span>
                    <!-- Random is not in the design; it stays reachable as a quiet toggle so the
                         `selectionMode: 'random'` path keeps a way in. -->
                    <button
                        type="button"
                        class="st-focus-ring rounded-st-pill text-st-sm font-bold text-st-muted underline-offset-2 hover:text-st-primary hover:underline"
                        @click="formData.selectionMode = formData.selectionMode === 'random' ? 'selection' : 'random'"
                    >
                        {{ formData.selectionMode === 'random' ? t('live-practice.pick-range') : t('live-practice.pick-randomly') }}
                    </button>
                </div>

                <div v-if="formData.selectionMode === 'selection'" class="flex items-center gap-3">
                    <input
                        v-model="formData.fromPhrase"
                        type="number"
                        min="1"
                        :max="formData.toPhrase"
                        :aria-label="t('live-practice.from-phrase')"
                        class="st-focus-ring h-[52px] w-[86px] rounded-st-md border-[1.5px] border-st-line bg-st-card px-4 text-center font-st-sans text-st-base font-bold text-st-strong transition duration-150 ease-out focus:border-st-primary"
                    />
                    <span class="text-st-base font-semibold text-st-muted">{{ t('live-practice.to') }}</span>
                    <input
                        v-model="formData.toPhrase"
                        type="number"
                        :min="formData.fromPhrase"
                        :aria-label="t('live-practice.to-phrase')"
                        class="st-focus-ring h-[52px] w-[86px] rounded-st-md border-[1.5px] border-st-line bg-st-card px-4 text-center font-st-sans text-st-base font-bold text-st-strong transition duration-150 ease-out focus:border-st-primary"
                    />
                    <span v-if="estimate" class="max-w-[5rem] text-st-sm font-semibold leading-[1.3] text-st-muted">{{ estimate }}</span>
                </div>

                <div v-else class="flex items-center gap-3">
                    <input
                        v-model="formData.totalPhrases"
                        type="number"
                        min="1"
                        max="30"
                        :aria-label="t('live-practice.total-phrases')"
                        class="st-focus-ring h-[52px] w-[86px] rounded-st-md border-[1.5px] border-st-line bg-st-card px-4 text-center font-st-sans text-st-base font-bold text-st-strong transition duration-150 ease-out focus:border-st-primary"
                    />
                    <span class="text-st-base font-semibold text-st-muted">{{ t('live-practice.at-random') }}</span>
                    <span v-if="estimate" class="max-w-[5rem] text-st-sm font-semibold leading-[1.3] text-st-muted">{{ estimate }}</span>
                </div>
            </div>
        </div>

        <p v-if="activeError" class="mt-3 flex items-center gap-1.5 text-st-sm font-bold text-st-danger">
            <StIcon name="solar:danger-triangle-bold" :size="15" class="flex-none" />
            {{ activeError }}
        </p>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { StIcon, StSegmentedControl } from 'subturtle-ui';
    import { SUPPORTED_LANGUAGES } from '~/utils/languages.static';
    import VoicePicker from '~/components/live/VoicePicker.vue';
    import { useLiveSessionVoices } from '~/composables/useLiveSessionVoices';
    import type { CoachVoice } from '~/types/live-session.type';

    const { t } = useI18n();

    const props = defineProps<{
        modelValue: {
            aiCharacter: string;
            selectionMode: 'selection' | 'random';
            fromPhrase: string;
            toPhrase: string;
            totalPhrases: string;
            nativeLanguage: string;
            mode?: 'voice' | 'text';
        };
        // Omitted by the bundle Gemini flow → voices are fetched from the server so
        // the picker matches the extension. The OpenAI/Gemini `StartNew` variants
        // still pass their own name lists.
        voiceOptions?: (string | CoachVoice)[];
    }>();

    const emit = defineEmits<{
        'update:modelValue': [
            value: {
                aiCharacter: string;
                selectionMode: 'selection' | 'random';
                fromPhrase: string;
                toPhrase: string;
                totalPhrases: string;
                nativeLanguage: string;
            }
        ];
    }>();

    const { voices: serverVoices, ensureLoaded } = useLiveSessionVoices();

    onMounted(() => {
        if (!props.voiceOptions) ensureLoaded();
    });

    // Use the explicit list when provided (StartNew variants); otherwise the
    // server-backed list fetched above.
    const resolvedVoices = computed<(string | CoachVoice)[]>(() => (props.voiceOptions && props.voiceOptions.length ? props.voiceOptions : serverVoices.value));

    const modeOptions = computed(() => [
        { value: 'voice', label: t('live-practice.mode.voice'), icon: 'solar:microphone-3-bold' },
        { value: 'text', label: t('live-practice.mode.text'), icon: 'solar:chat-round-line-bold' },
    ]);

    const formData = computed({
        get: () => props.modelValue,
        set: (value) => emit('update:modelValue', value),
    });

    /** Phrases in the current selection, whichever mode picked them. */
    const phraseCount = computed(() => {
        if (formData.value.selectionMode === 'random') return parseInt(formData.value.totalPhrases) || 0;
        const from = parseInt(formData.value.fromPhrase) || 0;
        const to = parseInt(formData.value.toPhrase) || 0;
        return Math.max(0, to - from + 1);
    });

    // ~45s per phrase: two coach turns and the learner's attempt, which is what the
    // "maximum 2 follow-ups per vocabulary" instruction produces in practice.
    const estimate = computed(() => {
        if (activeError.value || !phraseCount.value) return '';
        return t('live-practice.about-minutes', { n: Math.max(1, Math.round((phraseCount.value * 45) / 60)) });
    });

    const selectionError = computed(() => {
        if (formData.value.selectionMode !== 'selection') return '';

        const fromPhrase = parseInt(formData.value.fromPhrase) || 0;
        const toPhrase = parseInt(formData.value.toPhrase) || 0;
        const total = toPhrase - fromPhrase + 1;

        if (total > 30) {
            return t('live-practice.max-30-phrases-error');
        }

        if (fromPhrase < 1 || toPhrase < 1) {
            return t('live-practice.positive-numbers-required');
        }

        if (fromPhrase > toPhrase) {
            return t('live-practice.from-less-than-to-error');
        }

        return '';
    });

    const randomError = computed(() => {
        if (formData.value.selectionMode !== 'random') return '';

        const totalPhrases = parseInt(formData.value.totalPhrases) || 0;

        if (!totalPhrases) {
            return t('live-practice.total-phrases-required');
        }

        if (totalPhrases > 30) {
            return t('live-practice.max-30-phrases-error');
        }

        if (totalPhrases < 1) {
            return t('live-practice.positive-numbers-required');
        }

        return '';
    });

    // Exactly one of the two can be non-empty (each returns '' outside its own mode), so the
    // single message line under the inputs always carries the one that applies.
    const activeError = computed(() => selectionError.value || randomError.value);

    defineExpose({
        selectionError,
        randomError,
    });
</script>
