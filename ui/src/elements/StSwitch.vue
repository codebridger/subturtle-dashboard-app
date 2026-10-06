<template>
    <component
        :is="label ? 'label' : 'span'"
        class="st-inline-flex st-items-center st-gap-[10px] st-font-sans st-text-sm st-font-semibold st-text-body"
        :class="[disabled ? 'st-cursor-not-allowed' : 'st-cursor-pointer', $attrs.class]"
    >
        <button
            type="button"
            role="switch"
            :aria-checked="modelValue"
            :aria-label="label ? undefined : ariaLabel"
            :disabled="disabled"
            class="st-inline-flex st-items-center st-flex-none st-rounded-pill st-border-none st-p-[3px] st-transition-colors st-duration-base st-ease-out st-focus-ring"
            :class="[
                modelValue ? 'st-bg-primary' : 'st-bg-ink-300',
                disabled ? 'st-opacity-50 st-cursor-not-allowed' : 'st-cursor-pointer',
                size === 'sm' ? 'st-w-9 st-h-5' : 'st-w-[46px] st-h-[26px]',
            ]"
            @click="toggle"
        >
            <!-- Hard #fff, not `white`: --white is redeclared as a card neutral by the design
                 system's dark layer, and the knob has to stay light on the rose track in both. -->
            <span
                class="st-block st-rounded-circle st-bg-on-brand st-shadow-sm st-transition-transform st-duration-base st-ease-spring"
                :class="[
                    size === 'sm' ? 'st-w-3.5 st-h-3.5' : 'st-w-5 st-h-5',
                    modelValue ? (size === 'sm' ? 'st-translate-x-4' : 'st-translate-x-5') : 'st-translate-x-0',
                ]"
            />
        </button>
        <slot>{{ label }}</slot>
    </component>
</template>

<script setup lang="ts">
    defineOptions({ inheritAttrs: false });

    const props = withDefaults(
        defineProps<{
            modelValue?: boolean;
            /** Renders the control inside a <label>; without one, pass `ariaLabel`. */
            label?: string;
            /** Accessible name when the switch has no visible label. */
            ariaLabel?: string;
            size?: 'sm' | 'md';
            disabled?: boolean;
        }>(),
        { size: 'md' }
    );

    const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

    function toggle() {
        if (!props.disabled) emit('update:modelValue', !props.modelValue);
    }
</script>
