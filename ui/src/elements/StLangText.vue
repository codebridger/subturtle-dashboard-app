<template>
    <component :is="tag" class="st-lang" :lang="lang || undefined" :dir="direction">
        <slot />
    </component>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    /**
     * A run of text in one language. Sets `lang` (so the font rules in index.css pick a script
     * font) and `dir`, and isolates the run so a right-to-left own language never reorders the
     * left-to-right text around it, or the other way round.
     *
     * `rtl` is passed by the consumer: the library carries no language list, and the app's
     * list (or the server's capability register) knows which languages are right to left.
     * Left undefined, the browser picks the direction from the text (`dir="auto"`).
     */
    const props = withDefaults(
        defineProps<{
            /** BCP 47 / ISO 639-1 code, e.g. 'fa'. */
            lang?: string;
            rtl?: boolean;
            tag?: string;
        }>(),
        { tag: 'span', rtl: undefined }
    );

    const direction = computed(() => (props.rtl === undefined ? 'auto' : props.rtl ? 'rtl' : 'ltr'));
</script>
