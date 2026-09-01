<template>
    <div ref="wrapRef" class="st-relative st-inline-flex st-font-sans" @keydown="onKeydown">
        <button
            ref="triggerRef"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="isOpen"
            :aria-label="labels.menu"
            class="st-inline-flex st-p-0 st-border-none st-bg-transparent st-cursor-pointer st-rounded-circle st-transition-shadow st-duration-base st-ease-out"
            :style="{ boxShadow: isOpen ? '0 0 0 3px var(--ring-focus)' : 'none' }"
            @click="onTriggerClick"
        >
            <slot name="trigger">
                <StAvatar :name="name" :src="avatarSrc" size="md" />
            </slot>
        </button>

        <!--
            Teleported to <body> and positioned `fixed` against the trigger rect. This is not a
            style preference: the topbar sets `backdrop-filter`, which makes it a containing block
            for its descendants AND bleeds its blur under them, so an absolutely-positioned panel
            renders washed out. The design prototype hit exactly this and fixes it the same way.
        -->
        <Teleport to="body">
            <div
                v-if="isOpen"
                ref="panelRef"
                role="menu"
                :aria-label="labels.menu"
                class="st-fixed st-box-border st-font-sans st-bg-card st-border st-border-subtle st-rounded-lg st-shadow-lg st-p-[6px]"
                :style="panelStyle"
                @keydown="onKeydown"
            >
                <div class="st-flex st-items-center st-gap-3 st-px-[14px] st-pt-[14px] st-pb-3">
                    <StAvatar :name="name" :src="avatarSrc" size="md" />
                    <div class="st-flex st-min-w-0 st-flex-col st-gap-0.5">
                        <div class="st-flex st-min-w-0 st-items-center st-gap-1.5">
                            <span class="st-truncate st-text-base st-font-extrabold st-tracking-tight st-text-strong">{{ name }}</span>
                            <span
                                v-if="plan"
                                class="st-shrink-0 st-rounded-pill st-bg-primary-soft st-px-1.5 st-py-[3px] st-text-2xs st-font-extrabold st-leading-none st-text-rose-700"
                            >
                                {{ plan }}
                            </span>
                        </div>
                        <span :title="email" class="st-truncate st-text-sm st-font-semibold st-text-muted">{{ email }}</span>
                    </div>
                </div>

                <template v-for="(entry, i) in entries" :key="i">
                    <!-- Appearance: a row, but not a menuitem — nothing about it is clickable, so
                         it takes no hover wash and no roving focus. The radiogroup inside is its
                         own focus stop, reachable by Tab or by arrowing onto it. -->
                    <div v-if="entry.kind === 'appearance'" class="st-flex st-min-h-[44px] st-items-center st-gap-3 st-px-3">
                        <StIcon name="solar:sun-2-linear" :size="20" class="st-shrink-0 st-text-muted" />
                        <span class="st-min-w-0 st-flex-1 st-truncate st-text-base st-font-bold st-text-body">{{ labels.appearance }}</span>
                        <div
                            role="radiogroup"
                            :aria-label="labels.appearance"
                            class="st-flex st-h-7 st-shrink-0 st-items-center st-rounded-pill st-bg-sunken st-p-0.5"
                        >
                            <button
                                v-for="opt in THEME_OPTIONS"
                                :key="opt.value"
                                type="button"
                                role="radio"
                                :aria-checked="theme === opt.value"
                                :aria-label="labels[opt.value]"
                                :tabindex="theme === opt.value ? 0 : -1"
                                class="st-inline-flex st-h-6 st-w-8 st-cursor-pointer st-items-center st-justify-center st-rounded-pill st-border-none st-p-0 st-transition-colors st-duration-fast st-ease-out"
                                :class="theme === opt.value ? 'st-bg-card st-text-primary st-shadow-xs' : 'st-bg-transparent st-text-faint hover:st-text-muted'"
                                @click="selectTheme(opt.value)"
                                @keydown="onSegmentKeydown($event, opt.value)"
                            >
                                <StIcon :name="opt.icon" :size="16" />
                            </button>
                        </div>
                    </div>

                    <template v-else>
                        <div v-if="entry.item.dividerBefore" class="st-mx-2 st-my-1.5 st-h-px st-bg-ink-150" />
                        <button
                            :ref="(el) => setItemRef(el, entry.index)"
                            role="menuitem"
                            type="button"
                            tabindex="-1"
                            class="st-flex st-w-full st-box-border st-min-h-[44px] st-cursor-pointer st-items-center st-gap-3 st-rounded-md st-border-none st-bg-transparent st-px-3 st-text-left st-font-sans st-text-base st-font-bold st-outline-none st-transition-colors st-duration-fast st-ease-out"
                            :class="
                                entry.item.danger
                                    ? 'st-text-danger hover:st-bg-danger-soft focus-visible:st-bg-danger-soft'
                                    : 'st-text-body hover:st-bg-ink-100 focus-visible:st-bg-ink-100'
                            "
                            @click="activate(entry.item)"
                            @focus="focusIndex = entry.index"
                        >
                            <StIcon
                                :name="entry.item.icon"
                                :size="20"
                                class="st-shrink-0"
                                :class="entry.item.danger ? 'st-text-danger' : 'st-text-muted'"
                            />
                            <span class="st-min-w-0 st-flex-1 st-truncate">{{ entry.item.label }}</span>
                            <span v-if="entry.item.meta" class="st-shrink-0 st-text-xs st-font-bold st-text-faint">{{ entry.item.meta }}</span>
                        </button>
                    </template>
                </template>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
    import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
    import StAvatar from '../elements/StAvatar.vue';
    import StIcon from '../icon/StIcon.vue';
    import type { StProfileMenuItem, StTheme } from '../types';

    const THEME_OPTIONS: { value: StTheme; icon: string }[] = [
        { value: 'light', icon: 'solar:sun-2-linear' },
        { value: 'dark', icon: 'solar:moon-linear' },
        { value: 'system', icon: 'solar:monitor-linear' },
    ];

    const props = withDefaults(
        defineProps<{
            name?: string;
            email?: string;
            avatarSrc?: string;
            /** Optional pill beside the name, e.g. 'Learner'. */
            plan?: string;
            items?: StProfileMenuItem[];
            align?: 'left' | 'right';
            /** Panel width in px. 284 in the extension popup; the dashboard passes 296. */
            width?: number;
            /** v-model:open. Leave undefined to let the component own its own state. */
            open?: boolean;
            defaultOpen?: boolean;
            /** Renders the non-closing Appearance row above the sign-out divider. */
            themeSwitch?: boolean;
            theme?: StTheme;
            /**
             * Every user-visible string. The library has no i18n of its own — it ships to two
             * apps with different setups — so the consumer passes translations in and the
             * defaults keep it usable standalone.
             */
            labels?: Partial<Record<'menu' | 'appearance' | StTheme, string>>;
        }>(),
        {
            name: '',
            align: 'right',
            width: 284,
            theme: 'system',
            // Inlined rather than referencing a const: a withDefaults factory is hoisted out of
            // the setup scope, so it cannot close over anything declared here.
            items: () => [
                { label: 'Profile', icon: 'solar:user-linear' },
                { label: 'Study settings', icon: 'solar:settings-linear' },
                { label: 'Sign out', icon: 'solar:logout-2-linear', danger: true, dividerBefore: true },
            ],
        }
    );

    const emit = defineEmits<{ 'update:open': [boolean]; 'update:theme': [StTheme] }>();

    const DEFAULT_LABELS = { menu: 'Account menu', appearance: 'Appearance', light: 'Light', dark: 'Dark', system: 'System' };
    const labels = computed(() => ({ ...DEFAULT_LABELS, ...(props.labels ?? {}) }));

    const wrapRef = ref<HTMLElement | null>(null);
    const panelRef = ref<HTMLElement | null>(null);
    const triggerRef = ref<HTMLButtonElement | null>(null);
    const itemRefs = ref<(HTMLButtonElement | null)[]>([]);
    const focusIndex = ref(-1);
    /** Drives the entrance transition — flipped on the frame after the panel mounts. */
    const shown = ref(false);
    const pos = ref<{ top: number; left: number; right: number } | null>(null);

    // Controlled when `open` is bound, uncontrolled otherwise — the .d.ts contract allows both.
    const uncontrolled = ref(!!props.defaultOpen);
    const isOpen = computed({
        get: () => (props.open === undefined ? uncontrolled.value : props.open),
        set: (v) => {
            if (props.open === undefined) uncontrolled.value = v;
            emit('update:open', v);
        },
    });

    /** Rows in render order, with the Appearance row spliced in above the sign-out divider. */
    const entries = computed(() => {
        const list: ({ kind: 'item'; item: StProfileMenuItem; index: number } | { kind: 'appearance' })[] = [];
        const dividerAt = props.items.findIndex((it) => it.dividerBefore);
        const appearanceAt = dividerAt === -1 ? props.items.length : dividerAt;
        props.items.forEach((item, index) => {
            if (props.themeSwitch && index === appearanceAt) list.push({ kind: 'appearance' });
            list.push({ kind: 'item', item, index });
        });
        if (props.themeSwitch && appearanceAt === props.items.length) list.push({ kind: 'appearance' });
        return list;
    });

    function setItemRef(el: unknown, index: number) {
        itemRefs.value[index] = (el as HTMLButtonElement) ?? null;
    }

    function place() {
        const el = wrapRef.value;
        if (!el) return;
        const r = el.getBoundingClientRect();
        pos.value = { top: r.bottom + 10, left: r.left, right: window.innerWidth - r.right };
    }

    const panelStyle = computed(() => {
        const p = pos.value;
        const style: Record<string, string> = {
            top: p ? `${p.top}px` : '-9999px',
            // Below md the panel narrows and keeps a 12px viewport gutter (see the clamp below).
            width: `min(${props.width}px, calc(100vw - 24px))`,
            zIndex: 'var(--z-overlay)',
            opacity: shown.value ? '1' : '0',
            transform: shown.value ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.98)',
            transformOrigin: props.align === 'left' ? 'top left' : 'top right',
            transition: 'opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)',
        };
        if (props.align === 'left') style.left = `${Math.max(12, p?.left ?? 12)}px`;
        else style.right = `${Math.max(12, p?.right ?? 12)}px`;
        return style;
    });

    function onDocumentMousedown(e: MouseEvent) {
        const target = e.target as Node;
        if (wrapRef.value?.contains(target) || panelRef.value?.contains(target)) return;
        isOpen.value = false;
    }

    watch(isOpen, (open) => {
        if (!open) {
            shown.value = false;
            focusIndex.value = -1;
            pos.value = null;
            window.removeEventListener('resize', place);
            // `true` — must match the addEventListener options or the listener is never removed.
            window.removeEventListener('scroll', place, true);
            document.removeEventListener('mousedown', onDocumentMousedown);
            return;
        }
        place();
        window.addEventListener('resize', place);
        // Capture phase, so scrolling an inner container (the app shell's <main>) repositions
        // the panel too — a bubbling listener on window never sees those.
        window.addEventListener('scroll', place, true);
        document.addEventListener('mousedown', onDocumentMousedown);
        requestAnimationFrame(() => {
            shown.value = true;
        });
    });

    onBeforeUnmount(() => {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        document.removeEventListener('mousedown', onDocumentMousedown);
    });

    function close(restoreFocus = true) {
        isOpen.value = false;
        if (restoreFocus) triggerRef.value?.focus();
    }

    function onTriggerClick(e: MouseEvent) {
        const opening = !isOpen.value;
        isOpen.value = opening;
        // A click synthesised from Enter/Space reports detail 0. Opening by keyboard should land
        // focus on the first row; opening by pointer should leave it on the trigger.
        if (opening && e.detail === 0) nextTick(() => moveFocus(1));
    }

    function activate(item: StProfileMenuItem) {
        item.onClick?.();
        close(false);
    }

    function selectTheme(value: StTheme) {
        // Deliberately does not close: the point is to watch the page repaint behind the menu.
        emit('update:theme', value);
    }

    /** Roving focus over the menuitems, wrapping at both ends. */
    function moveFocus(step: number) {
        const focusable = props.items.map((_, i) => i).filter((i) => itemRefs.value[i]);
        if (!focusable.length) return;
        const at = focusable.indexOf(focusIndex.value);
        const next = focusable[(at + step + focusable.length * 2) % focusable.length] ?? focusable[step > 0 ? 0 : focusable.length - 1];
        focusIndex.value = next;
        itemRefs.value[next]?.focus();
    }

    // Bound to BOTH the wrapper and the panel: the panel is teleported to <body>, so its keydown
    // events do not bubble through the wrapper the way they would in the same DOM subtree.
    function onKeydown(e: KeyboardEvent) {
        if (!isOpen.value) return;
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(e.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            focusIndex.value = -1;
            moveFocus(e.key === 'Home' ? 1 : -1);
        }
    }

    function onSegmentKeydown(e: KeyboardEvent, value: StTheme) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        // Left/Right stay inside the radiogroup; Up/Down fall through to onKeydown and leave it.
        e.preventDefault();
        e.stopPropagation();
        const at = THEME_OPTIONS.findIndex((o) => o.value === value);
        const next = THEME_OPTIONS[(at + (e.key === 'ArrowRight' ? 1 : -1) + THEME_OPTIONS.length) % THEME_OPTIONS.length];
        emit('update:theme', next.value);
        nextTick(() => (panelRef.value?.querySelector('[role="radio"][aria-checked="true"]') as HTMLElement | null)?.focus());
    }
</script>
