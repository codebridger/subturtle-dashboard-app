<template>
    <label :for="id" class="st-block st-font-sans" :class="$attrs.class" :style="$attrs.style as any">
        <span v-if="label" class="st-block st-mb-[6px] st-text-sm st-font-bold st-text-body">
            {{ label }}
            <span v-if="optionalLabel" class="st-font-semibold st-text-faint">{{ optionalLabel }}</span>
        </span>

        <textarea
            :id="id"
            :value="modelValue"
            :placeholder="placeholder"
            :disabled="disabled"
            :rows="rows"
            class="st-block st-w-full st-box-border st-min-h-[84px] st-resize-y st-px-[14px] st-py-[10px] st-rounded-md st-border-[1.5px] st-font-sans st-text-sm st-font-medium st-text-strong st-outline-none st-transition st-duration-fast st-ease-out placeholder:st-text-faint disabled:st-cursor-not-allowed"
            :class="[
                disabled ? 'st-bg-ink-100' : 'st-bg-card',
                error ? 'st-border-danger' : 'st-border-default',
                error ? '' : 'focus:st-border-primary',
                'focus:st-shadow-[0_0_0_3px_var(--ring-focus)]',
            ]"
            v-bind="textareaAttrs"
            @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        />

        <span v-if="error || hint" class="st-block st-mt-[6px] st-text-xs st-font-semibold" :class="error ? 'st-text-danger' : 'st-text-muted'">
            {{ error || hint }}
        </span>
    </label>
</template>

<script setup lang="ts">
    // Same contract as StInput; kept separate because a textarea takes the ring directly (there is
    // no icon to wrap) and carries `rows` / vertical resize. As there, `class` and `style` size the
    // whole field and stay on the wrapper.
    import { computed, useAttrs } from 'vue';

    defineOptions({ inheritAttrs: false });

    const attrs = useAttrs();
    const textareaAttrs = computed(() => {
        const { class: _class, style: _style, ...rest } = attrs;
        return rest;
    });

    withDefaults(
        defineProps<{
            modelValue?: string;
            label?: string;
            /** Muted suffix after the label, e.g. "(optional)". */
            optionalLabel?: string;
            placeholder?: string;
            hint?: string;
            error?: string;
            disabled?: boolean;
            rows?: number;
            id?: string;
        }>(),
        { rows: 3 }
    );

    defineEmits<{ 'update:modelValue': [string] }>();
</script>
