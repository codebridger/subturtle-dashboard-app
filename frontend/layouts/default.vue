<template>
    <!--
        <App> is pilotui's theme/RTL provider. It stays until the last pilotui-era page is
        migrated: every un-migrated screen's components still read their theming from it.
        It no longer DRIVES the theme, though — @nuxtjs/color-mode owns the preference now and
        plugins/theme.client.ts mirrors it into pilotui's store, so this only follows.
        StAppShell replaces only the chrome (DashboardShell + SidebarMenu + HorizontalMenu).
    -->
    <App>
        <!-- StAppShell fills its container and scrolls internally, so it needs a container
             that is exactly the viewport. -->
        <div class="h-[100dvh]">
            <StAppShell
                :nav="menuItems"
                :active="activeItem"
                product-name="Subturtle"
                logo-src="/assets/images/logo.svg"
                :collapsed="railCollapsed"
                @navigate="onNavigate"
                @update:collapsed="setRail"
            >
                <!-- Breadcrumb built from the nav itself, so it can never drift from the menu. -->
                <template #title>
                    <span v-if="crumb" class="inline-flex items-center gap-2 text-st-sm font-bold text-st-faint">
                        <span>{{ crumb.section }}</span>
                        <StIcon name="solar:alt-arrow-right-linear" :size="16" />
                        <span class="text-st-body">{{ crumb.label }}</span>
                    </span>
                </template>

                <!-- Plan pill, then the account menu — the theme switch now lives inside the
                     menu's Appearance row, so there is no separate switcher up here. -->
                <template #header-right>
                    <StPlanPill v-if="planLabel" :label="planLabel" />
                    <PartialProfileMenu />
                </template>

                <!-- overflow-x-clip contains decorative full-bleed page backgrounds (e.g. blurred blobs positioned past the edge)
                     so they never trigger a page-wide horizontal scroll; clip (not hidden) leaves vertical scrolling untouched. -->
                <div class="overflow-x-clip">
                    <!-- Voice banner stacks above the AI-credits banner (more time-sensitive). -->
                    <VoiceCapBanner />
                    <UsageCapBanner />
                    <NuxtPage />
                    <!-- pilotui's DashboardShell had a dedicated #footer slot "right below of
                         the content"; StAppShell has no footer, so the global version footer
                         goes at the end of the content column, which renders identically. -->
                    <PartialAppVersionFooter />
                </div>
            </StAppShell>
        </div>

        <!--
            Each closed pilotui modal still renders an empty trigger button in normal flow.
            Three of them stack ~54px below the full-height shell and give the page a second
            scrollbar next to the shell's own. h-0 takes them out of the layout without
            clipping anything: pilotui renders the dialogs themselves as `fixed inset-0`, and
            a static box's overflow never clips a fixed descendant.
            Goes away with <App> once the last pilotui page is migrated.
        -->
        <div class="h-0 overflow-hidden">
            <!-- Single global "plan limit reached" modal. The modular-rest interceptor
                 opens it for ANY RPC blocked by a tier limit/lock; no per-page wiring. -->
            <FreemiumLimitationModal :model-value="tierLimitOpen" :modal-title="t('subscription.tier-limit.title')"
                :main-message="tierLimitMessage" :sub-message="t('subscription.tier-limit.sub')" icon-name="IconLockDots"
                :primary-button-label="tierLimitPrimaryLabel" :secondary-button-label="tierLimitSecondaryLabel"
                :auto-redirect-on-upgrade="false" @upgrade="onTierLimitPrimary" @secondary="onTierLimitSecondary"
                @update:model-value="(v) => { if (!v) closeTierLimitModal(); }" />

            <!-- Council 004: dedicated 100% voice-cap modal (top-up / use text chat). -->
            <VoiceCapModal />

            <DevOnly>
                <ThemeCustomizer />
            </DevOnly>
        </div>
    </App>
</template>

<script setup lang="ts">
import { App, ThemeCustomizer } from 'pilotui/shell';
import { StAppShell, StIcon, StPlanPill } from 'subturtle-ui';
import { useProfileStore } from '~/stores/profile';
import UsageCapBanner from '~/components/freemium_alerts/UsageCapBanner.vue';
import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
import VoiceCapBanner from '~/components/VoiceCapBanner.vue';
import VoiceCapModal from '~/components/VoiceCapModal.vue';
import { useTierLimitModal } from '~/composables/useTierLimitModal';
import { DASHBOARD_NAV_ROUTES, activeNavId } from '~/composables/useDashboardNavigatorItems';
import { useLeitnerStore } from '~/stores/leitner';

const { t, te } = useI18n();
const { open: tierLimitOpen, feature: tierLimitFeature, closeTierLimitModal } = useTierLimitModal();
const router = useRouter();
const route = useRoute();
const leitner = useLeitnerStore();
const profileStore = useProfileStore();

// Hidden until the subscription resolves, rather than flashing a wrong plan for a beat.
const planLabel = computed(() => {
    if (profileStore.isSubscriptionFetching) return null;
    return profileStore.isFreemium ? 'Free' : profileStore.activeSubscription?.label || null;
});

const RAIL_KEY = 'subturtle.rail';
const railCollapsed = ref(false);

// The board's leitner_review activity carries the due count the sidebar badge shows; it is
// the same source /board reads. Fetched once for the whole session, not per page.
const dueCount = computed(() => leitner.boardActivities.find((a) => a.type === 'leitner_review')?.meta?.dueCount ?? 0);
const menuItems = useDashboardNavigatorItems(() => ({ board: dueCount.value }));
const activeItem = computed(() => activeNavId(route.path));

const crumb = computed(() => {
    for (const group of menuItems.value) {
        const item = group.items.find((i) => i.id === activeItem.value);
        if (item) return { section: group.section, label: item.label };
    }
    return null;
});

onMounted(() => {
    try {
        railCollapsed.value = localStorage.getItem(RAIL_KEY) === '1';
    } catch {
        // Private mode / blocked storage — the rail just starts expanded.
    }
});

// The layout mounts while the auth middleware is still restoring the stored session, and the
// client signs in anonymously first — so both `isLogin` and a user id are already truthy
// before the real session exists. `type === 'user'` is the signal that actually distinguishes
// the two (stores/profile.ts gates its own bootstrap on it); anything looser fires this
// request with anonymous permissions and it 400s.
watch(
    () => authUser.value?.type === 'user',
    (signedIn) => {
        if (signedIn && !leitner.boardActivities.length) leitner.fetchBoard();
    },
    { immediate: true }
);

function setRail(collapsed: boolean) {
    railCollapsed.value = collapsed;
    try {
        localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0');
    } catch {
        // Non-fatal: the preference just won't survive a reload.
    }
}

function onNavigate(id: string) {
    const to = DASHBOARD_NAV_ROUTES[id];
    if (to && to !== route.path) router.push(to);
}

// Feature-specific heading for the global plan-limit modal (falls back to a
// generic message for any feature without dedicated copy).
const tierLimitMessage = computed(() => {
    const feature = tierLimitFeature.value;
    const key = `subscription.tier-limit.features.${feature}`;
    return feature && te(key) ? t(key) : t('subscription.tier-limit.message');
});

// Feature-aware CTAs (Council 004 S17): Reader's text-chat limits get bespoke
// buttons/actions; every other feature keeps the default labels + "go to plans".
const tierLimitPrimaryLabel = computed(() => {
    const k = `subscription.tier-limit.cta.${tierLimitFeature.value}.primary`;
    return te(k) ? t(k) : t('subscription.tier-limit.primary');
});
const tierLimitSecondaryLabel = computed(() => {
    const k = `subscription.tier-limit.cta.${tierLimitFeature.value}.secondary`;
    return te(k) ? t(k) : t('subscription.tier-limit.secondary');
});
function onTierLimitPrimary() {
    const feature = tierLimitFeature.value;
    closeTierLimitModal();
    if (feature === 'text_chat_messages_per_chat') router.push('/practice/live-session-text');
    else if (feature === 'text_chat_count') router.push('/settings/subscription?suggest=learner');
    else router.push('/settings/subscription');
}
function onTierLimitSecondary() {
    const feature = tierLimitFeature.value;
    closeTierLimitModal();
    if (feature === 'text_chat_messages_per_chat') router.push('/settings/subscription?suggest=learner');
    else if (feature === 'text_chat_count') router.push('/settings/subscription');
    // Other features: the secondary ("Not now") simply closes.
}
</script>
