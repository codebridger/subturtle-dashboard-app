<template>
  <div>
    <h1>{{ t('scenario-list') }}</h1>
  </div>
</template>

<script setup lang="ts">
  const { t } = useI18n();

  definePageMeta({
    layout: 'default',
    title: () => t('scenario-list'),
    // @ts-ignore
    middleware: ['auth'],
  });
</script>
