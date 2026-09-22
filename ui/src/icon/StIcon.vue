<template>
    <svg
        v-if="def"
        :viewBox="`0 0 ${def.width} ${def.height}`"
        :width="size"
        :height="size"
        aria-hidden="true"
        focusable="false"
        class="st-inline-block st-shrink-0"
        v-html="def.body"
    />
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { icons } from './icons.generated';

    const props = withDefaults(
        defineProps<{
            /** Iconify name, e.g. 'solar:fire-bold-duotone'. Must be in scripts/build-icons.mjs. */
            name: string;
            /** Rendered px size for both axes. */
            size?: number | string;
        }>(),
        { size: 24 }
    );

    // Bodies come from @iconify/json at build time, never from user input, so v-html is safe here.
    const def = computed(() => {
        const found = icons[props.name];
        if (!found && import.meta.env.DEV) {
            console.warn(`[subturtle-ui] unknown icon "${props.name}" — add it to scripts/build-icons.mjs`);
        }
        return found;
    });
</script>
