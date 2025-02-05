<template>
  <div>
    <h1>{{ t('membership-plans') }}</h1>
  </div>
</template>

<script setup lang="ts">
  const { t } = useI18n();

  definePageMeta({
    layout: 'default',
    title: () => t('membership-plans'),
    // @ts-ignore
    middleware: ['auth'],
  });
</script>
