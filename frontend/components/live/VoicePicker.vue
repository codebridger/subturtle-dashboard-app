<template>
    <div class="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4">
        <button
            v-for="v in normalized"
            :key="v.name"
            type="button"
            :aria-pressed="modelValue === v.name"
            class="st-focus-ring relative flex flex-col items-center gap-2 rounded-st-md border-[1.5px] p-3 text-center transition duration-200 ease-out"
            :class="
                modelValue === v.name
                    ? 'border-st-primary bg-st-primary-soft shadow-st-sm'
                    : 'border-st-line bg-st-card hover:border-st-ink-300 hover:shadow-st-xs'
            "
            @click="$emit('update:modelValue', v.name)"
        >
            <!-- Corner tick, so the selected coach reads without relying on the tint alone. -->
            <StIcon v-if="modelValue === v.name" name="solar:check-circle-bold" :size="18" class="absolute right-1.5 top-1.5 text-st-primary" />

            <img v-if="v.avatarUrl" :src="v.avatarUrl" alt="" class="h-11 w-11 rounded-full object-cover" />
            <span
                v-else
                class="flex h-11 w-11 items-center justify-center rounded-full font-st-display text-st-md font-black text-white"
                :style="{ backgroundColor: v.avatarColor }"
                aria-hidden="true"
            >
                {{ v.initial }}
            </span>

            <span class="text-st-sm font-extrabold leading-tight text-st-strong">{{ v.label }}</span>
            <span v-if="v.description" class="text-st-2xs font-semibold leading-[1.35] text-st-muted [text-wrap:pretty]">{{ v.description }}</span>
        </button>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { StIcon } from 'subturtle-ui';
    import type { CoachVoice } from '~/types/live-session.type';

    // Accepts either rich server voices (CoachVoice[]) or a plain name list
    // (string[]) so the same picker serves the server-backed Gemini bundle flow and
    // the OpenAI/Gemini `StartNew` variants that still pass their own name arrays.
    const props = defineProps<{
        modelValue: string;
        voices: (string | CoachVoice)[];
    }>();

    defineEmits<{ 'update:modelValue': [value: string] }>();

    // Deterministic palette so name-only lists still get a stable colored avatar. Literal
    // hexes rather than tokens on purpose: these are identity colours for eight fixed
    // coaches, and the initial on top is always white in either theme.
    const FALLBACK_COLORS = ['#7C3AED', '#2563EB', '#0D9488', '#EA580C', '#DB2777', '#D97706', '#4F46E5', '#059669'];

    const normalized = computed(() =>
        (props.voices || []).map((v) => {
            const voice: Partial<CoachVoice> & { name: string } = typeof v === 'string' ? { name: v, label: v } : v;
            const label = voice.label || voice.name;
            let color = voice.avatarColor;
            if (!color) {
                const sum = [...voice.name].reduce((a, c) => a + c.charCodeAt(0), 0);
                color = FALLBACK_COLORS[sum % FALLBACK_COLORS.length];
            }
            return {
                name: voice.name,
                label,
                description: voice.description,
                avatarColor: color,
                avatarUrl: voice.avatarUrl || null,
                initial: label.charAt(0).toUpperCase(),
            };
        })
    );
</script>
