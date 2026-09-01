<template>
    <span class="st-relative st-inline-flex">
        <button
            type="button"
            :aria-label="ariaLabel"
            :class="[
                'st-inline-flex st-items-center st-justify-center st-shrink-0 st-p-0 st-border-none st-cursor-pointer st-rounded-pill st-focus-ring',
                'st-transition st-duration-fast st-ease-out active:st-scale-[0.92]',
                SIZE[size].box,
                variant === 'ghost' ? 'st-bg-transparent hover:st-bg-ink-100' : 'st-bg-ink-50 hover:st-bg-ink-100',
            ]"
            @click="cycle"
            @mouseenter="hovered = true"
            @mouseleave="hovered = false"
            @focus="focused = true"
            @blur="focused = false"
        >
            <!--
                Keyed on the mode so each press remounts the glyph and replays the spin. The colour
                carries the state as much as the shape does, so it is bound rather than themed.
            -->
            <StIcon :key="mode" :name="ICONS[mode]" :size="SIZE[size].icon" class="st-theme-glyph" :style="{ color: GLYPH[mode] }" />
        </button>

        <span
            v-if="hovered || focused"
            role="tooltip"
            class="st-absolute st-left-1/2 st-top-full st-z-tooltip st-mt-2 -st-translate-x-1/2 st-whitespace-nowrap st-rounded-sm st-bg-ink-900 st-px-2 st-py-1 st-text-2xs st-font-bold st-text-paper st-pointer-events-none"
        >
            {{ tooltip }}
        </span>
    </span>
</template>

<script setup lang="ts">
    import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import StIcon from '../icon/StIcon.vue';
    import type { StTheme } from '../types';

    /**
     * The theme control: one round icon button that cycles Light -> Dark -> System.
     *
     * It can run standalone — persisting to `persistKey` and writing `data-theme` itself — which is
     * what the design-system specimens and the extension need. The dashboard instead drives it
     * controlled (`v-model`) with `persist-key=""` and `:apply="false"`, because there
     * @nuxtjs/color-mode already owns persistence, the attribute and the pre-paint script, and two
     * writers would fight over both.
     */
    const props = withDefaults(
        defineProps<{
            /** v-model. Omit for uncontrolled. */
            modelValue?: StTheme;
            size?: 'sm' | 'md' | 'lg';
            variant?: 'soft' | 'ghost';
            /** localStorage key. '' disables persistence (specimens, screenshots). */
            persistKey?: string;
            /** Whether to write data-theme on <html>. false for specimens and static screenshots. */
            apply?: boolean;
            /**
             * Copy; the library carries no i18n of its own. The mode names are plain strings, but
             * `aria` and `resolved` are FORMATTERS, not patterns — a consumer must not hand a
             * pattern like 'Theme: {current}.' to vue-i18n's t() without params, because t()
             * interpolates the placeholders to empty strings on the way through.
             */
            labels?: {
                light?: string;
                dark?: string;
                system?: string;
                aria?: (current: string, next: string) => string;
                resolved?: (mode: string, resolved: string) => string;
            };
        }>(),
        { size: 'md', variant: 'soft', persistKey: 'subturtle:theme', apply: true }
    );

    const emit = defineEmits<{ 'update:modelValue': [StTheme]; change: [StTheme, 'light' | 'dark'] }>();

    const ORDER: StTheme[] = ['light', 'dark', 'system'];
    const ICONS: Record<StTheme, string> = {
        light: 'solar:sun-2-bold-duotone',
        dark: 'solar:moon-bold-duotone',
        system: 'solar:monitor-bold-duotone',
    };
    const GLYPH: Record<StTheme, string> = {
        light: 'rgb(var(--amber-500))',
        dark: 'rgb(var(--rose-600))',
        system: 'rgb(var(--text-muted))',
    };
    const SIZE = {
        sm: { box: 'st-w-8 st-h-8', icon: 18 },
        md: { box: 'st-w-10 st-h-10', icon: 22 },
        lg: { box: 'st-w-12 st-h-12', icon: 26 },
    };

    const DEFAULT_LABELS = {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
        aria: (current: string, next: string) => `Theme: ${current}. Switch to ${next}.`,
        resolved: (mode: string, res: string) => `${mode} · ${res}`,
    };
    const labels = computed(() => ({ ...DEFAULT_LABELS, ...(props.labels ?? {}) }));

    const hovered = ref(false);
    const focused = ref(false);

    const uncontrolled = ref<StTheme>(readStored() ?? 'system');
    const mode = computed<StTheme>(() => props.modelValue ?? uncontrolled.value);

    function readStored(): StTheme | null {
        if (!props.persistKey) return null;
        try {
            const v = localStorage.getItem(props.persistKey);
            return v === 'light' || v === 'dark' || v === 'system' ? v : null;
        } catch {
            return null; // Private mode / blocked storage — fall back to the default.
        }
    }

    /**
     * Live, not read once: a `system` user has to flip at sunset without reloading. Tracked even
     * when controlled, because the tooltip and the aria-label both name what `system` resolves to.
     */
    const prefersDark = ref(false);
    let mql: MediaQueryList | undefined;
    const onMedia = (e: MediaQueryListEvent | MediaQueryList) => (prefersDark.value = e.matches);

    onMounted(() => {
        if (!window.matchMedia) return;
        mql = window.matchMedia('(prefers-color-scheme: dark)');
        onMedia(mql);
        mql.addEventListener('change', onMedia);
    });
    onBeforeUnmount(() => mql?.removeEventListener('change', onMedia));

    const resolved = computed<'light' | 'dark'>(() => (mode.value === 'system' ? (prefersDark.value ? 'dark' : 'light') : mode.value));

    const ariaLabel = computed(() => {
        const next = ORDER[(ORDER.indexOf(mode.value) + 1) % ORDER.length];
        return labels.value.aria(labels.value[mode.value], labels.value[next].toLowerCase());
    });

    // `system` also names what it currently resolves to — "System · dark".
    const tooltip = computed(() =>
        mode.value === 'system' ? labels.value.resolved(labels.value.system, labels.value[resolved.value].toLowerCase()) : labels.value[mode.value]
    );

    function applyAttribute() {
        if (!props.apply) return;
        document.documentElement.setAttribute('data-theme', resolved.value);
    }

    function cycle() {
        const next = ORDER[(ORDER.indexOf(mode.value) + 1) % ORDER.length];
        if (props.modelValue === undefined) uncontrolled.value = next;
        if (props.persistKey) {
            try {
                localStorage.setItem(props.persistKey, next);
            } catch {
                // Non-fatal: the preference just won't survive a reload.
            }
        }
        emit('update:modelValue', next);
    }

    // Covers both a click and an OS-level flip while on `system`.
    watch([resolved, mode], () => {
        applyAttribute();
        emit('change', mode.value, resolved.value);
    });
    onMounted(applyAttribute);
</script>

<style>
    /* Each press turns the glyph over. Keyed remount replays it; reduced motion drops it. */
    @keyframes st-theme-glyph-spin {
        from {
            transform: rotate(-180deg);
        }
        to {
            transform: rotate(0deg);
        }
    }

    .st-theme-glyph {
        animation: st-theme-glyph-spin var(--dur-slow) var(--ease-spring);
    }

    @media (prefers-reduced-motion: reduce) {
        .st-theme-glyph {
            animation: none;
        }
    }
</style>
