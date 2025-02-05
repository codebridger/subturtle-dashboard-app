<template>
  <div>
    <h1>{{ t('statistics') }}</h1>
  </div>
</template>

<script setup lang="ts">
  const { t } = useI18n();

  definePageMeta({
    layout: 'default',
    title: () => t('statistics'),
    // @ts-ignore
    middleware: ['auth'],
  });
</script>
