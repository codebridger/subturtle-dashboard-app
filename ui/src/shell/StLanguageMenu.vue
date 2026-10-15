<template>
    <div ref="wrapRef" class="st-relative st-inline-flex st-font-sans" @keydown="onKeydown">
        <!-- The pill: chip, English name, "Starting at A1". The English name only (Q13). -->
        <button
            ref="triggerRef"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="isOpen"
            :aria-label="ariaLabel"
            data-testid="language-menu-trigger"
            class="st-inline-flex st-items-center st-gap-2 st-h-10 st-pl-1.5 st-pr-3 st-rounded-pill st-border st-border-default st-bg-card st-text-strong st-font-sans st-text-sm st-font-extrabold st-cursor-pointer st-focus-ring st-transition-shadow st-duration-base st-ease-out"
            :style="{ boxShadow: isOpen ? '0 0 0 3px var(--ring-focus)' : undefined }"
            @click="onTriggerClick"
        >
            <span class="st-inline-flex st-items-center st-justify-center st-w-7 st-h-7 st-shrink-0 st-rounded-circle st-bg-primary-soft st-text-rose-700 st-text-xs st-font-black">
                {{ current.chip }}
            </span>
            <span class="st-truncate">{{ current.name }}</span>
            <span v-if="current.level" class="st-hidden sm:st-inline st-text-xs st-font-bold st-text-muted">{{ current.level }}</span>
            <StIcon name="solar:alt-arrow-down-linear" :size="16" class="st-text-muted" />
        </button>

        <Teleport to="body">
            <div
                v-if="isOpen"
                ref="panelRef"
                role="menu"
                :aria-label="labels.menu"
                class="st-fixed st-box-border st-flex st-flex-col st-gap-1 st-font-sans st-bg-card st-border st-border-subtle st-rounded-xl st-shadow-xl st-p-2.5"
                :style="panelStyle"
                @keydown="onKeydown"
            >
                <div class="st-px-2.5 st-pt-1.5 st-pb-1 st-text-2xs st-font-extrabold st-uppercase st-tracking-caps st-text-faint">
                    {{ labels.heading }}
                </div>

                <button
                    v-for="(lang, index) in languages"
                    :key="lang.code"
                    :ref="(el) => setItemRef(el, index)"
                    type="button"
                    role="menuitemradio"
                    :aria-checked="lang.active"
                    tabindex="-1"
                    class="st-flex st-w-full st-items-center st-gap-3 st-px-2.5 st-py-2.5 st-rounded-md st-border-none st-text-left st-font-sans st-text-strong st-cursor-pointer st-outline-none st-transition-colors st-duration-fast st-ease-out"
                    :class="lang.active ? 'st-bg-accent-tint' : 'st-bg-transparent hover:st-bg-ink-100 focus-visible:st-bg-ink-100'"
                    @click="choose(lang.code)"
                >
                    <span
                        class="st-inline-flex st-items-center st-justify-center st-w-7 st-h-7 st-shrink-0 st-rounded-circle st-text-xs st-font-black"
                        :class="lang.active ? 'st-bg-primary-soft st-text-rose-700' : 'st-bg-ink-100 st-text-ink-700'"
                    >
                        {{ lang.chip }}
                    </span>
                    <span class="st-flex st-min-w-0 st-flex-1 st-flex-col">
                        <span class="st-truncate st-text-sm st-font-extrabold">{{ lang.label }}</span>
                        <span v-if="lang.meta" class="st-truncate st-text-xs st-font-semibold st-text-muted">{{ lang.meta }}</span>
                    </span>
                    <StIcon v-if="lang.active" name="solar:check-circle-bold" :size="22" class="st-shrink-0 st-text-jade-600" />
                </button>

                <template v-for="(action, index) in actions" :key="action.label">
                    <div v-if="action.dividerBefore" class="st-h-px st-my-1 st-bg-ink-150" />
                    <button
                        :ref="(el) => setItemRef(el, languages.length + index)"
                        type="button"
                        role="menuitem"
                        tabindex="-1"
                        class="st-flex st-w-full st-items-center st-gap-3 st-px-2.5 st-py-2.5 st-rounded-md st-border-none st-bg-transparent st-text-left st-font-sans st-text-strong st-cursor-pointer st-outline-none hover:st-bg-ink-100 focus-visible:st-bg-ink-100"
                        @click="activate(action)"
                    >
                        <span
                            v-if="action.chip"
                            class="st-inline-flex st-items-center st-justify-center st-w-7 st-h-7 st-shrink-0 st-rounded-circle st-bg-sunken st-text-strong st-text-xs st-font-bold"
                            :lang="action.chipLang"
                        >
                            {{ action.chip }}
                        </span>
                        <StIcon v-else-if="action.icon" :name="action.icon" :size="20" class="st-shrink-0 st-text-muted" />
                        <span class="st-flex st-min-w-0 st-flex-1 st-flex-col">
                            <span class="st-truncate st-text-sm st-font-extrabold">{{ action.label }}</span>
                            <span v-if="action.meta" class="st-text-xs st-font-semibold st-text-muted">{{ action.meta }}</span>
                        </span>
                        <StIcon v-if="action.chevron" name="solar:alt-arrow-right-linear" :size="16" class="st-shrink-0 st-text-muted" />
                    </button>
                </template>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
    import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
    import StIcon from '../icon/StIcon.vue';
    import type { StLanguageMenuAction, StLanguageMenuItem } from '../types';

    /**
     * The one language switcher (multilingual 2.0): a pill in the topbar that opens the
     * learner's languages, the active one ticked, then actions (Add a language, Manage
     * languages, "You speak Persian"). Same placement and behaviour as StProfileMenu, which
     * it mirrors: teleported, fixed-positioned (the topbar's backdrop-filter would wash out an
     * absolute panel), roving focus, Escape closes.
     *
     * Router-free and i18n-free, like the rest of the library: the consumer passes labels and
     * handles `select` and each action's `onClick`.
     */
    const props = withDefaults(
        defineProps<{
            /** The pill: two-letter chip, English name, and the "Starting at A1" line. */
            current: { chip: string; name: string; level?: string };
            languages?: StLanguageMenuItem[];
            actions?: StLanguageMenuAction[];
            width?: number;
            labels?: Partial<Record<'menu' | 'heading' | 'trigger', string>>;
        }>(),
        { languages: () => [], actions: () => [], width: 330 }
    );

    const emit = defineEmits<{ select: [code: string] }>();

    const DEFAULT_LABELS = { menu: 'Your languages', heading: 'Your languages', trigger: 'Change language' };
    const labels = computed(() => ({ ...DEFAULT_LABELS, ...(props.labels ?? {}) }));
    const ariaLabel = computed(() => [labels.value.trigger, props.current.name, props.current.level].filter(Boolean).join('. '));

    const isOpen = ref(false);
    const wrapRef = ref<HTMLElement | null>(null);
    const panelRef = ref<HTMLElement | null>(null);
    const triggerRef = ref<HTMLButtonElement | null>(null);
    const itemRefs = ref<(HTMLButtonElement | null)[]>([]);
    const focusIndex = ref(-1);
    const pos = ref<{ top: number; right: number } | null>(null);

    function setItemRef(el: unknown, index: number) {
        itemRefs.value[index] = (el as HTMLButtonElement) ?? null;
    }

    function place() {
        const el = wrapRef.value;
        if (!el) return;
        const r = el.getBoundingClientRect();
        pos.value = { top: r.bottom + 8, right: window.innerWidth - r.right };
    }

    const panelStyle = computed(() => ({
        top: pos.value ? `${pos.value.top}px` : '-9999px',
        right: `${Math.max(12, pos.value?.right ?? 12)}px`,
        width: `min(${props.width}px, calc(100vw - 24px))`,
        zIndex: 'var(--z-overlay)',
    }));

    function onDocumentMousedown(e: MouseEvent) {
        const target = e.target as Node;
        if (wrapRef.value?.contains(target) || panelRef.value?.contains(target)) return;
        isOpen.value = false;
    }

    function stopListening() {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        document.removeEventListener('mousedown', onDocumentMousedown);
    }

    watch(isOpen, (open) => {
        if (!open) {
            focusIndex.value = -1;
            pos.value = null;
            stopListening();
            return;
        }
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        document.addEventListener('mousedown', onDocumentMousedown);
    });

    onBeforeUnmount(stopListening);

    function close(restoreFocus = true) {
        isOpen.value = false;
        if (restoreFocus) triggerRef.value?.focus();
    }

    function onTriggerClick(e: MouseEvent) {
        isOpen.value = !isOpen.value;
        if (isOpen.value && e.detail === 0) nextTick(() => moveFocus(1));
    }

    function choose(code: string) {
        close(false);
        emit('select', code);
    }

    function activate(action: StLanguageMenuAction) {
        close(false);
        action.onClick?.();
    }

    function moveFocus(step: number) {
        const count = props.languages.length + props.actions.length;
        const focusable = Array.from({ length: count }, (_, i) => i).filter((i) => itemRefs.value[i]);
        if (!focusable.length) return;
        const at = focusable.indexOf(focusIndex.value);
        const next = focusable[(at + step + focusable.length * 2) % focusable.length] ?? focusable[0];
        focusIndex.value = next;
        itemRefs.value[next]?.focus();
    }

    function onKeydown(e: KeyboardEvent) {
        if (!isOpen.value) return;
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(e.key === 'ArrowDown' ? 1 : -1);
        }
    }

    defineExpose({ open: () => (isOpen.value = true), close: () => close(false) });
</script>
