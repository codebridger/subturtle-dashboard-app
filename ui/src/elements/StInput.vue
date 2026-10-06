<template>
    <label :for="id" class="st-block st-font-sans" :class="$attrs.class" :style="$attrs.style as any">
        <span v-if="label" class="st-block st-mb-[6px] st-text-sm st-font-bold st-text-body">{{ label }}</span>

        <!--
            The ring lives on the WRAPPER, not the input: the icon sits inside the same box, so the
            focus treatment has to surround both. focus-within does that without a JS focus flag
            (the design's React version keeps one in state only because inline styles can't express
            the variant).
        -->
        <span
            class="st-flex st-items-center st-gap-[10px] st-h-control-md st-px-[14px] st-rounded-md st-border-[1.5px] st-transition st-duration-fast st-ease-out"
            :class="[
                disabled ? 'st-bg-ink-100' : 'st-bg-card',
                error ? 'st-border-danger' : 'st-border-default',
                error ? '' : 'focus-within:st-border-primary',
                'focus-within:st-shadow-[0_0_0_3px_var(--ring-focus)]',
            ]"
        >
            <StIcon v-if="icon" :name="icon" :size="18" class="st-flex-none st-text-faint" />
            <input
                :id="id"
                :type="type"
                :value="modelValue"
                :placeholder="placeholder"
                :disabled="disabled"
                class="st-flex-1 st-min-w-0 st-border-none st-bg-transparent st-font-sans st-text-sm st-font-medium st-text-strong st-outline-none placeholder:st-text-faint disabled:st-cursor-not-allowed"
                v-bind="inputAttrs"
                @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
            />
        </span>

        <span v-if="error || hint" class="st-block st-mt-[6px] st-text-xs st-font-semibold" :class="error ? 'st-text-danger' : 'st-text-muted'">
            {{ error || hint }}
        </span>
    </label>
</template>

<script setup lang="ts">
    import { computed, useAttrs } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    // Attributes land on the <input>, not the <label> wrapper — so `autofocus`, `maxlength`,
    // `aria-*` and friends reach the control the caller means. `class` and `style` are the
    // exception: those size and place the whole field, so they stay on the wrapper.
    defineOptions({ inheritAttrs: false });

    const attrs = useAttrs();
    const inputAttrs = computed(() => {
        const { class: _class, style: _style, ...rest } = attrs;
        return rest;
    });

    withDefaults(
        defineProps<{
            modelValue?: string | number;
            label?: string;
            placeholder?: string;
            /** Leading icon, an Iconify name. */
            icon?: string;
            /** Helper text below the field. Replaced by `error` when that is set. */
            hint?: string;
            /** Error message. Also turns the border and the helper line red. */
            error?: string;
            type?: string;
            disabled?: boolean;
            id?: string;
        }>(),
        { type: 'text' }
    );

    defineEmits<{ 'update:modelValue': [string] }>();
</script>
