<template>
    <App>
        <DashboardShell brand-title="Subturtle">
            <template #header>
                <div class="flex w-full justify-end">
                    <div class="flex items-center space-x-2">
                        <PartialThemeSwitcher class="scale-75" />
                        <PartialProfileButton />
                    </div>
                </div>
            </template>

            <template #horizontal-menu>
                <HorizontalMenu :items="[]" />
            </template>

            <template #sidebar-menu>
                <SidebarMenu title="Subturtle" brand-logo="/assets/images/logo.svg" :items="menuItems"
                    @item-click="onMenuItemClicked" />
            </template>

            <template #content>
                <UsageCapBanner />
                <NuxtPage />
            </template>
        </DashboardShell>

        <DevOnly>
            <ThemeCustomizer />
        </DevOnly>
    </App>
</template>

<script setup lang="ts">
import { App, DashboardShell, ThemeCustomizer, SidebarMenu, HorizontalMenu } from 'pilotui/shell';
import type { SidebarItemType, HorizontalMenuItemType } from 'pilotui/types';
import UsageCapBanner from '~/components/freemium_alerts/UsageCapBanner.vue';

const menuItems = useDashboardNavigatorItems();
const router = useRouter();

function onMenuItemClicked(item: SidebarItemType | HorizontalMenuItemType) {
    if (item?.to) {
        router.push(item.to);
    }
}
</script>
