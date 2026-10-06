<template>
    <!--
        Teleported to <body> and positioned `fixed`, for the same reason StProfileMenu's panel is:
        an ancestor with `backdrop-filter` (the app shell's topbar) or any transform creates a
        containing block that an in-tree overlay cannot escape. The design prototype uses
        `position: absolute` because it renders inside a fixed-size artboard, not a page.
    -->
    <Teleport to="body">
        <div
            v-if="open"
            class="st-fixed st-inset-0 st-z-modal st-flex st-items-center st-justify-center st-box-border st-p-6 st-bg-overlay/45 st-backdrop-blur-[3px] st-font-sans"
            @click="dismissible && $emit('close')"
        >
            <div
                role="dialog"
                aria-modal="true"
                :aria-label="title"
                class="st-relative st-w-full st-max-h-full st-box-border st-overflow-y-auto st-bg-card st-border st-border-subtle st-rounded-lg st-shadow-xl st-p-card"
                :class="size === 'sm' ? 'st-max-w-[380px]' : size === 'lg' ? 'st-max-w-[720px]' : 'st-max-w-[520px]'"
                @click.stop
            >
                <button
                    v-if="dismissible"
                    type="button"
                    aria-label="Close"
                    class="st-absolute st-top-[14px] st-right-[14px] st-inline-flex st-h-[30px] st-w-[30px] st-items-center st-justify-center st-rounded-sm st-border-none st-bg-transparent st-text-faint st-cursor-pointer st-transition st-duration-fast st-ease-out hover:st-bg-ink-100 hover:st-text-body st-focus-ring"
                    @click="$emit('close')"
                >
                    <StIcon name="solar:close-circle-bold" :size="20" />
                </button>

                <h2 v-if="title" class="st-m-0 st-text-lg st-font-black st-tracking-tight st-text-strong" :class="dismissible ? 'st-pr-[34px]' : ''">
                    {{ title }}
                </h2>
                <p v-if="description" class="st-mt-2 st-mb-0 st-text-sm st-font-semibold st-text-muted st-leading-normal [text-wrap:pretty]">
                    {{ description }}
                </p>

                <div v-if="$slots.default" :class="title || description ? 'st-mt-[18px]' : ''">
                    <slot />
                </div>

                <div v-if="$slots.actions" class="st-mt-[22px] st-flex st-justify-end st-gap-[10px]">
                    <slot name="actions" />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
    import { onBeforeUnmount, onMounted } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    const props = withDefaults(
        defineProps<{
            open?: boolean;
            title?: string;
            description?: string;
            size?: 'sm' | 'md' | 'lg';
            /** Backdrop click, Escape and the corner button all close. Off for blocking dialogs. */
            dismissible?: boolean;
        }>(),
        { open: true, size: 'md', dismissible: true }
    );

    const emit = defineEmits<{ close: [] }>();

    // Escape is the one affordance the design's inline styles could not express, and the only way
    // to leave the dialog from the keyboard.
    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && props.open && props.dismissible) emit('close');
    }

    onMounted(() => document.addEventListener('keydown', onKeydown));
    onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>
