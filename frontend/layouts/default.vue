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
                <!-- overflow-x-clip contains decorative full-bleed page backgrounds (e.g. blurred blobs positioned past the edge)
                     so they never trigger a page-wide horizontal scroll; clip (not hidden) leaves vertical scrolling untouched. -->
                <div class="overflow-x-clip">
                    <!-- Voice banner stacks above the AI-credits banner (more time-sensitive). -->
                    <VoiceCapBanner />
                    <UsageCapBanner />
                    <NuxtPage />
                </div>
            </template>
        </DashboardShell>

        <!-- Single global "plan limit reached" modal. The modular-rest interceptor
             opens it for ANY RPC blocked by a tier limit/lock; no per-page wiring. -->
        <FreemiumLimitationModal :model-value="tierLimitOpen" :modal-title="t('subscription.tier-limit.title')"
            :main-message="tierLimitMessage" :sub-message="t('subscription.tier-limit.sub')" icon-name="IconLockDots"
            :primary-button-label="t('subscription.tier-limit.primary')"
            :secondary-button-label="t('subscription.tier-limit.secondary')"
            @update:model-value="(v) => { if (!v) closeTierLimitModal(); }" />

        <!-- Council 004: dedicated 100% voice-cap modal (top-up / use text chat). -->
        <VoiceCapModal />

        <DevOnly>
            <ThemeCustomizer />
        </DevOnly>
    </App>
</template>

<script setup lang="ts">
import { App, DashboardShell, ThemeCustomizer, SidebarMenu, HorizontalMenu } from 'pilotui/shell';
import type { SidebarItemType, HorizontalMenuItemType } from 'pilotui/types';
import UsageCapBanner from '~/components/freemium_alerts/UsageCapBanner.vue';
import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
import VoiceCapBanner from '~/components/VoiceCapBanner.vue';
import VoiceCapModal from '~/components/VoiceCapModal.vue';
import { useTierLimitModal } from '~/composables/useTierLimitModal';

const { t, te } = useI18n();
const { open: tierLimitOpen, feature: tierLimitFeature, closeTierLimitModal } = useTierLimitModal();
const menuItems = useDashboardNavigatorItems();
const router = useRouter();

// Feature-specific heading for the global plan-limit modal (falls back to a
// generic message for any feature without dedicated copy).
const tierLimitMessage = computed(() => {
    const feature = tierLimitFeature.value;
    const key = `subscription.tier-limit.features.${feature}`;
    return feature && te(key) ? t(key) : t('subscription.tier-limit.message');
});

function onMenuItemClicked(item: SidebarItemType | HorizontalMenuItemType) {
    if (item?.to) {
        router.push(item.to);
    }
}
</script>
