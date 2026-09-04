<template>
    <div class="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <button
            v-for="v in normalized"
            :key="v.name"
            type="button"
            :aria-pressed="modelValue === v.name"
            class="st-focus-ring flex flex-col items-center gap-2 rounded-st-lg border-[1.5px] px-3 pb-3.5 pt-5 text-center transition duration-200 ease-out"
            :class="modelValue === v.name ? 'border-st-primary bg-st-primary-soft' : 'border-st-line bg-st-card hover:border-st-ink-300 hover:shadow-st-xs'"
            @click="$emit('update:modelValue', v.name)"
        >
            <!-- Waveform mark. Inline rather than an icon: the design's bars are a fixed
                 five-step shape with no Solar equivalent, and it animates while playing. -->
            <span class="flex h-8 items-end justify-center gap-[3px]" :class="modelValue === v.name ? 'text-st-primary' : 'text-st-ink-300'" aria-hidden="true">
                <span
                    v-for="(h, i) in BARS"
                    :key="i"
                    class="w-[3.5px] rounded-st-pill bg-current"
                    :class="playing === v.name ? 'st-wave-bar' : ''"
                    :style="{ height: `${h}px`, animationDelay: `${i * 90}ms` }"
                />
            </span>

            <span class="text-st-base font-extrabold leading-tight text-st-strong">{{ v.label }}</span>
            <span v-if="v.description" class="text-st-sm font-semibold leading-[1.35] text-st-muted">{{ v.description }}</span>

            <!-- Sample playback. `.stop` so hearing a voice does not also select it. -->
            <span
                class="mt-1 inline-flex items-center gap-1.5 rounded-st-pill px-3 py-1.5 text-st-sm font-bold transition duration-150 ease-out"
                :class="playing === v.name ? 'bg-st-primary text-white' : 'bg-st-ink-100 text-st-muted hover:bg-st-ink-150'"
                role="button"
                tabindex="0"
                :aria-label="playing === v.name ? t('live-practice.voice.stop', { name: v.label }) : t('live-practice.voice.preview-aria', { name: v.label })"
                @click.stop="preview(v.name)"
                @keydown.enter.stop.prevent="preview(v.name)"
                @keydown.space.stop.prevent="preview(v.name)"
            >
                <StIcon :name="loading === v.name ? 'solar:refresh-bold' : 'solar:play-bold'" :size="13" :class="loading === v.name ? 'animate-spin' : ''" />
                {{ playing === v.name ? t('live-practice.voice.playing') : t('live-practice.voice.preview') }}
            </span>
        </button>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { StIcon } from 'subturtle-ui';
    import type { CoachVoice } from '~/types/live-session.type';
    import { useVoicePreview } from '~/composables/useVoicePreview';

    const { t } = useI18n();

    // Accepts either rich server voices (CoachVoice[]) or a plain name list
    // (string[]) so the same picker serves the server-backed Gemini bundle flow and
    // the OpenAI/Gemini `StartNew` variants that still pass their own name arrays.
    const props = defineProps<{
        modelValue: string;
        voices: (string | CoachVoice)[];
    }>();

    defineEmits<{ 'update:modelValue': [value: string] }>();

    const { preview, playing, loading } = useVoicePreview();

    /** The design's waveform silhouette, in px. */
    const BARS = [11, 19, 28, 16, 9];

    const normalized = computed(() =>
        (props.voices || []).map((v) => {
            const voice: Partial<CoachVoice> & { name: string } = typeof v === 'string' ? { name: v, label: v } : v;
            return {
                name: voice.name,
                label: voice.label || voice.name,
                description: voice.description,
            };
        })
    );
</script>

<style scoped>
    /* Only while a sample plays; `prefers-reduced-motion` holds the bars still. */
    .st-wave-bar {
        animation: st-wave 900ms ease-in-out infinite;
        transform-origin: bottom;
    }
    @keyframes st-wave {
        0%,
        100% {
            transform: scaleY(0.5);
        }
        50% {
            transform: scaleY(1);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .st-wave-bar {
            animation: none;
        }
    }
</style>
