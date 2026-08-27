<template>
    <div
        class="st-flex st-h-full st-min-h-0 st-overflow-hidden st-bg-page st-font-sans"
        :data-rail="collapsed ? 'collapsed' : 'expanded'"
        :style="{ '--sidebar-w': collapsed ? COLLAPSED_W : undefined }"
    >
        <!--
            Below md the sidebar is an off-canvas drawer. Left in flow it would eat 272px of a
            375px viewport, squeezing the content column to a sliver that clips its own
            children — they stay in the DOM but measure as hidden.
        -->
        <div
            v-if="drawerOpen"
            class="st-fixed st-inset-0 st-z-overlay st-bg-ink-950/40 md:st-hidden"
            @click="drawerOpen = false"
        />

        <aside
            class="st-fixed st-inset-y-0 st-left-0 st-z-overlay st-w-[17rem] md:st-relative md:st-inset-auto md:st-z-auto md:st-w-sidebar md:st-translate-x-0 st-flex st-flex-col st-shrink-0 st-h-full st-bg-card st-border-r st-border-subtle st-px-4 st-py-5 st-transition-transform st-duration-base st-ease-out md:st-transition-[width]"
            :class="drawerOpen ? 'st-translate-x-0' : '-st-translate-x-full'"
        >
            <div class="st-flex st-items-center st-gap-[10px] st-px-2 st-pt-1 st-pb-[22px]" :class="collapsed ? 'st-justify-center' : ''">
                <img v-if="logoSrc" :src="logoSrc" alt="" class="st-w-[34px] st-h-[34px] st-shrink-0" />
                <span
                    v-if="!collapsed && productName"
                    class="st-text-[22px] st-font-black st-tracking-[-0.03em] st-text-strong st-truncate"
                >
                    {{ productName }}
                </span>
            </div>

            <StSidebarNav :groups="nav" :active="active" :collapsed="collapsed" @navigate="onNavigate" />

            <button
                v-if="collapsible"
                type="button"
                class="st-absolute st-top-[76px] -st-right-[14px] st-z-20 st-hidden md:st-flex st-items-center st-justify-center st-w-7 st-h-7 st-p-0 st-rounded-circle st-border st-border-subtle st-bg-card st-shadow-sm st-text-muted st-cursor-pointer st-focus-ring hover:st-text-body"
                :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
                :title="collapsed ? 'Expand menu' : 'Collapse menu'"
                :aria-expanded="!collapsed"
                @click="$emit('update:collapsed', !collapsed)"
            >
                <StIcon :name="collapsed ? 'solar:alt-arrow-right-linear' : 'solar:alt-arrow-left-linear'" :size="17" />
            </button>

            <div v-if="$slots['sidebar-footer']" class="st-pt-4">
                <slot name="sidebar-footer" :collapsed="collapsed" />
            </div>
        </aside>

        <div class="st-flex-1 st-flex st-flex-col st-min-w-0 st-overflow-hidden">
            <header
                class="st-shrink-0 st-flex st-items-center st-justify-between st-h-[68px] st-px-4 md:st-px-8 st-border-b st-border-subtle st-bg-page/80 st-backdrop-blur-[8px]"
            >
                <div class="st-flex st-items-center st-gap-3 st-min-w-0">
                    <button
                        type="button"
                        class="st-flex md:st-hidden st-items-center st-justify-center st-w-9 st-h-9 st-shrink-0 st-rounded-md st-border-none st-bg-transparent st-text-body st-cursor-pointer st-focus-ring hover:st-bg-ink-100"
                        aria-label="Open menu"
                        @click="drawerOpen = true"
                    >
                        <StIcon name="solar:hamburger-menu-linear" :size="22" />
                    </button>
                    <span class="st-text-md st-font-extrabold st-text-strong st-min-w-0 st-truncate">
                        <slot name="title" />
                    </span>
                </div>
                <div class="st-flex st-items-center st-gap-3 st-shrink-0">
                    <slot name="header-right" />
                </div>
            </header>

<!-- overflow-x must be clipped, not visible: the ambient blobs are positioned past the
                 right edge, and a scrolling box cannot keep overflow-x visible — it would silently
                 become auto and add a horizontal scrollbar. -->
            <main class="st-flex-1 st-overflow-y-auto st-overflow-x-clip st-relative">
                <template v-if="ambient">
                    <div
                        class="st-pointer-events-none st-absolute -st-top-[10%] -st-left-[6%] st-w-[36%] st-h-[36%] st-rounded-circle st-bg-primary/5 st-blur-[120px]"
                    />
                    <div
                        class="st-pointer-events-none st-absolute -st-bottom-[10%] -st-right-[6%] st-w-[36%] st-h-[36%] st-rounded-circle st-bg-accent/5 st-blur-[120px]"
                    />
                </template>

                <div class="st-relative st-mx-auto st-px-4 st-pt-6 st-pb-16 md:st-px-8 md:st-pt-8" :style="{ maxWidth }">
                    <slot />
                </div>
            </main>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref } from 'vue';
    import StIcon from '../icon/StIcon.vue';
    import StSidebarNav from './StSidebarNav.vue';
    import type { StNavGroup } from '../types';

    /** Rail width when collapsed. Expanded width is --sidebar-w from the token sheet (17rem). */
    const COLLAPSED_W = '76px';

    withDefaults(
        defineProps<{
            nav?: StNavGroup[];
            /** id of the active nav item. Fully controlled — the shell keeps no selection state. */
            active?: string;
            productName?: string;
            logoSrc?: string;
            /** Content column width. */
            maxWidth?: string;
            /** The soft rose/jade background blobs behind the page content. */
            ambient?: boolean;
            /** Shows the rail collapse toggle. */
            collapsible?: boolean;
            /** v-model:collapsed. Persistence is the app's job. */
            collapsed?: boolean;
        }>(),
        {
            nav: () => [],
            productName: 'Subturtle',
            maxWidth: 'var(--container-max)',
            ambient: true,
            collapsible: true,
            collapsed: false,
        }
    );

    const emit = defineEmits<{ navigate: [string]; 'update:collapsed': [boolean] }>();

    /** Off-canvas drawer, below md only. Transient UI, so the shell owns it. */
    const drawerOpen = ref(false);

    function onNavigate(id: string) {
        drawerOpen.value = false;
        emit('navigate', id);
    }
</script>
