<template>
    <nav class="st-sidebar-nav st-flex st-flex-col st-gap-[18px] st-flex-1 st-min-h-0">
        <div v-for="(group, gi) in groups" :key="group.section || gi">
            <div
                v-if="group.section && !collapsed"
                class="st-px-[10px] st-pb-2 st-text-2xs st-font-extrabold st-tracking-caps st-uppercase st-text-faint"
            >
                {{ group.section }}
            </div>

            <div class="st-flex st-flex-col st-gap-[2px]">
                <button
                    v-for="item in group.items"
                    :key="item.id"
                    type="button"
                    class="st-nav-item st-flex st-items-center st-gap-[11px] st-w-full st-p-[10px] st-rounded-md st-border-none st-text-sm st-text-left st-cursor-pointer st-transition st-duration-fast st-ease-out st-focus-ring"
                    :class="
                        item.id === active
                            ? 'st-bg-primary-soft st-text-rose-700 st-font-extrabold'
                            : 'st-bg-transparent st-text-body st-font-semibold hover:st-bg-ink-50'
                    "
                    :aria-current="item.id === active ? 'page' : undefined"
                    @click="$emit('navigate', item.id)"
                >
                    <StIcon
                        v-if="item.icon"
                        :name="item.icon"
                        :size="22"
                        :class="item.id === active ? 'st-text-primary' : 'st-text-muted'"
                    />
                    <!-- Kept in the DOM when collapsed: it is the button's accessible name, and
                         the stylesheet turns it into a hover/focus tooltip. -->
                    <span class="st-rail-label st-flex-1">{{ item.label }}</span>
                    <span
                        v-if="item.badge != null && !collapsed"
                        class="st-text-2xs st-font-extrabold"
                        :class="item.id === active ? 'st-text-rose-700' : 'st-text-faint'"
                    >
                        {{ item.badge }}
                    </span>
                </button>
            </div>
        </div>
    </nav>
</template>

<script setup lang="ts">
    import StIcon from '../icon/StIcon.vue';
    import type { StNavGroup } from '../types';

    withDefaults(
        defineProps<{
            groups?: StNavGroup[];
            active?: string;
            collapsed?: boolean;
        }>(),
        { groups: () => [], collapsed: false }
    );

    defineEmits<{ navigate: [string] }>();
</script>

<style>
    /* Expanded: the nav scrolls if it outgrows the rail. */
    .st-sidebar-nav {
        overflow-y: auto;
    }

    /*
     * Collapsed: overflow must be visible or the label tooltips get clipped (a box with
     * overflow-y:auto cannot keep overflow-x:visible). With seven or so items the rail is
     * short enough that dropping the scroll costs nothing.
     */
    [data-rail='collapsed'] .st-sidebar-nav {
        overflow: visible;
    }

    [data-rail='collapsed'] .st-nav-item {
        position: relative;
        justify-content: center;
    }

    [data-rail='collapsed'] .st-nav-item > .st-rail-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    [data-rail='collapsed'] .st-nav-item:hover > .st-rail-label,
    [data-rail='collapsed'] .st-nav-item:focus-visible > .st-rail-label {
        left: calc(100% + 8px);
        top: 50%;
        transform: translateY(-50%);
        z-index: 30;
        width: auto;
        height: auto;
        overflow: visible;
        clip-path: none;
        padding: 6px 11px;
        border-radius: var(--radius-sm);
        background: rgb(var(--ink-950));
        /* Literal, not var(--white): the dark layer redeclares that as the card neutral. */
        color: #fff;
        font-size: var(--text-xs);
        font-weight: 700;
        box-shadow: var(--shadow-md);
    }
</style>
