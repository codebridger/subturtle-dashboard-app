<template>
  <App>
    <DashboardShell brand-title="ChatPilots">
      <template #header>
        <div class="flex w-full justify-end">
          <PartialProfileButton />
        </div>
      </template>

      <template #horizontal-menu>
        <HorizontalMenu :items="[]" />
      </template>

      <template #sidebar-menu>
        <SidebarMenu title="ChatPilots" :items="menuItems" @item-click="onMenuItemClicked" />
      </template>

      <template #content>
        <NuxtPage />
      </template>
    </DashboardShell>

    <ThemeCustomizer />
  </App>
</template>

<script setup lang="ts">
  import { App, DashboardShell, ThemeCustomizer, SidebarMenu, HorizontalMenu } from '@tiny-ideas-ir/lib-vue-components/shell.ts';
  import type { SidebarItemType, HorizontalMenuItemType } from '@tiny-ideas-ir/lib-vue-components/types.ts';

  const menuItems = useDashboardNavigatorItems();
  const router = useRouter();

  function onMenuItemClicked(item: SidebarItemType | HorizontalMenuItemType) {
    if (item?.to) {
      router.push(item.to);
    }
  }
</script>
