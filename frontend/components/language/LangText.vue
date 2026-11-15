<template>
    <StLangText :lang="langCode" :rtl="rtl" :tag="tag"><slot /></StLangText>
</template>

<script setup lang="ts">
    import { StLangText } from 'subturtle-ui';
    import { isRtl, toCode } from '~/utils/languages';

    /**
     * Text in one language, with its direction and script font (D-21). Use it for anything in
     * the learner's own language (translations, Coach explanations, "You speak فارسی") and for
     * learning-language text that sits inside it. `code` takes a code or a stored name.
     */
    const props = withDefaults(defineProps<{ code?: string | null; tag?: string }>(), { tag: 'span', code: undefined });

    const langCode = computed(() => toCode(props.code) ?? undefined);
    // A known language gets an explicit direction; an unknown one lets the browser decide.
    const rtl = computed(() => (langCode.value ? isRtl(langCode.value) : undefined));
</script>
