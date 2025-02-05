<template>
  <span>Instagram connected status</span>
</template>

<script setup lang="ts">
  const { t } = useI18n();

  definePageMeta({
    layout: 'spotlight',
    title: () => t('instagram-status'),
    // @ts-ignore
    // middleware: ['auth'],
  });
</script>
