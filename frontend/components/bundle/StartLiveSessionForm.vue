<template>
    <div class="flex flex-col gap-6">
        <!-- Coach: the mode picks the transport, the grid picks the voice. The mode control
             sits in this section's header, where the design puts it in the card header. -->
        <section>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 class="font-st-display text-st-md font-black tracking-st-tight text-st-strong">{{ t('live-practice.coach.title') }}</h3>
                    <p class="mt-0.5 text-st-sm font-semibold text-st-muted">
                        {{ formData.mode === 'text' ? t('live-practice.coach.subtitle-text') : t('live-practice.coach.subtitle-voice') }}
                    </p>
                </div>

                <StSegmentedControl
                    :model-value="formData.mode === 'text' ? 'text' : 'voice'"
                    :options="modeOptions"
                    size="sm"
                    @update:model-value="(v) => (formData.mode = v as 'voice' | 'text')"
                />
            </div>

            <!-- Voice only — a text session has no spoken voice. -->
            <VoicePicker v-if="formData.mode !== 'text'" v-model="formData.aiCharacter" :voices="resolvedVoices" />
        </section>

        <!-- Explanation language. "Auto" lets the coach take it from the bundle's translations. -->
        <section>
            <label class="block">
                <span class="mb-1 block text-st-sm font-bold text-st-body">{{ t('live-practice.native-language') }}</span>
                <span class="mb-2 block text-st-xs font-semibold leading-[1.45] text-st-muted [text-wrap:pretty]">
                    {{ t('live-practice.native-language-hint') }}
                </span>
                <span class="relative block">
                    <StIcon name="solar:global-linear" :size="18" class="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-st-faint" />
                    <select
                        v-model="formData.nativeLanguage"
                        class="st-focus-ring h-11 w-full appearance-none rounded-st-md border-[1.5px] border-st-ink-300 bg-st-card pl-[42px] pr-10 font-st-sans text-st-sm font-medium text-st-strong transition duration-150 ease-out focus:border-st-primary"
                    >
                        <option value="auto">{{ t('live-practice.native-language-auto') }}</option>
                        <option v-for="lang in SUPPORTED_LANGUAGES" :key="lang.code" :value="lang.title">{{ lang.title }}</option>
                    </select>
                    <StIcon
                        name="solar:alt-arrow-down-linear"
                        :size="18"
                        class="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2 text-st-faint"
                    />
                </span>
            </label>
        </section>

        <!-- Which phrases. A contiguous range by default; the switch swaps in a random sample.
             The design shows only the range, so Random is a quiet toggle, not a second tab. -->
        <section>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 class="font-st-display text-st-md font-black tracking-st-tight text-st-strong">{{ t('live-practice.phrases.title') }}</h3>
                <StSwitch
                    :model-value="formData.selectionMode === 'random'"
                    size="sm"
                    :label="t('live-practice.pick-randomly')"
                    @update:model-value="(on) => (formData.selectionMode = on ? 'random' : 'selection')"
                />
            </div>

            <div v-if="formData.selectionMode === 'selection'" class="flex gap-3">
                <StInput v-model="formData.fromPhrase" type="number" min="1" :max="formData.toPhrase" :label="t('live-practice.from-phrase')" class="flex-1" />
                <StInput v-model="formData.toPhrase" type="number" :min="formData.fromPhrase" :label="t('live-practice.to-phrase')" class="flex-1" />
            </div>

            <StInput v-else v-model="formData.totalPhrases" type="number" min="1" max="30" :label="t('live-practice.total-phrases')" />

            <p v-if="activeError" class="mt-2 flex items-center gap-1.5 text-st-xs font-bold text-st-danger">
                <StIcon name="solar:danger-triangle-bold" :size="14" class="flex-none" />
                {{ activeError }}
            </p>
        </section>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { StIcon, StInput, StSegmentedControl, StSwitch } from 'subturtle-ui';
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
