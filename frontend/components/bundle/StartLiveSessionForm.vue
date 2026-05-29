<template>
    <div class="space-y-6">
        <!-- Conversation mode: voice (audio Live API) vs text-only -->
        <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('live-practice.mode.label') }}
            </label>
            <div class="flex rounded-md bg-gray-100 p-1 dark:bg-gray-700">
                <button type="button" @click="formData.mode = 'voice'" :class="[
                    'flex-1 rounded-md py-2 text-center text-sm',
                    formData.mode !== 'text'
                        ? 'bg-white font-medium text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                ]">
                    {{ t('live-practice.mode.voice') }}
                </button>
                <button type="button" @click="formData.mode = 'text'" :class="[
                    'flex-1 rounded-md py-2 text-center text-sm',
                    formData.mode === 'text'
                        ? 'bg-white font-medium text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                ]">
                    {{ t('live-practice.mode.text') }}
                </button>
            </div>
        </div>

        <!-- AI Character Selection — voice only (text mode has no spoken voice) -->
        <div v-if="formData.mode !== 'text'">
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('live-practice.ai-character') }}
            </label>
            <VoicePicker v-model="formData.aiCharacter" :voices="resolvedVoices" />
        </div>

        <!-- Native Language Selection -->
        <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('live-practice.native-language') }}
            </label>
            <p class="mb-2 text-xs text-gray-500 dark:text-gray-400">
                {{ t('live-practice.native-language-hint') }}
            </p>
            <select v-model="formData.nativeLanguage"
                class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                <option value="auto">{{ t('live-practice.native-language-auto') }}</option>
                <option v-for="lang in SUPPORTED_LANGUAGES" :key="lang.code" :value="lang.title">
                    {{ lang.title }}
                </option>
            </select>
        </div>

        <!-- Selection Tabs -->
        <div>
            <div class="mb-2 flex rounded-md bg-gray-100 p-1 dark:bg-gray-700">
                <button @click="formData.selectionMode = 'selection'" :class="[
                    'flex-1 rounded-md py-2 text-center text-sm',
                    formData.selectionMode === 'selection'
                        ? 'bg-white font-medium text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                ]">
                    {{ t('live-practice.selection') }}
                </button>
                <button @click="formData.selectionMode = 'random'" :class="[
                    'flex-1 rounded-md py-2 text-center text-sm',
                    formData.selectionMode === 'random'
                        ? 'bg-white font-medium text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                ]">
                    {{ t('live-practice.random') }}
                </button>
            </div>

            <!-- Selection mode options -->
            <div v-if="formData.selectionMode === 'selection'" class="space-y-4">
                <div class="flex space-x-4">
                    <div class="flex-1">
                        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ t('live-practice.from-phrase') }}
                        </label>
                        <Input v-model="formData.fromPhrase" type="number" min="1" :max="formData.toPhrase"
                            class="w-full" />
                    </div>
                    <div class="flex-1">
                        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ t('live-practice.to-phrase') }}
                        </label>
                        <Input v-model="formData.toPhrase" type="number" :min="formData.fromPhrase" class="w-full" />
                    </div>
                </div>
                <p v-if="selectionError" class="text-sm text-red-500">
                    {{ selectionError }}
                </p>
            </div>

            <!-- Random mode options -->
            <div v-else class="space-y-4">
                <div>
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {{ t('live-practice.total-phrases') }}
                    </label>
                    <Input v-model="formData.totalPhrases" type="number" min="1" max="30" class="w-full" />
                </div>
                <p v-if="randomError" class="text-sm text-red-500">
                    {{ randomError }}
                </p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Input } from 'pilotui';
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
const resolvedVoices = computed<(string | CoachVoice)[]>(() =>
    props.voiceOptions && props.voiceOptions.length
        ? props.voiceOptions
        : serverVoices.value
);

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

defineExpose({
    selectionError,
    randomError,
});
</script>
