<script setup lang="ts">
onBeforeMount(() => {
  /**
   * Add translations to the navigation items
   * of the TairoCollapseLayout
   *
   * This is a hack to add translations to the navigation items.
   */
  const appConfig = useAppConfig();
  const { t } = useI18n();

  appConfig.tairo.collapse?.navigation?.items?.forEach((item) => {
    item.name = t(item.name);
  });
});
</script>

<template>
  <TairoCollapseLayout>
    <slot />
  </TairoCollapseLayout>
</template>
