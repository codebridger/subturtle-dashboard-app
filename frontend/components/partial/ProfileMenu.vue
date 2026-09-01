<template>
    <div>
        <StProfileMenu
            v-model:open="open"
            :name="profileStore.userDetail?.name ?? ''"
            :email="profileStore.email"
            :avatar-src="profileStore.profilePicture || undefined"
            :plan="planLabel"
            :items="items"
            :width="296"
            :labels="labels"
        >
            <template #trigger>
                <StAvatar :name="profileStore.userDetail?.name ?? ''" :src="profileStore.profilePicture || undefined" size="md" online />
            </template>
        </StProfileMenu>

        <!--
            Sign-out confirmation, carried over from the pilotui ProfileButton this replaces.
            Rendered as a sibling of the menu, not inside it: the menu closes on the row's click,
            which would unmount a modal nested in its panel before it could show.
        -->
        <Modal v-model="showSignOutModal" :title="t('confirm-sign-out')">
            <template #trigger>
                <div class="hidden" />
            </template>

            <template #default>
                <div class="flex flex-col space-y-2 p-4">
                    <p>{{ t('confirm-sign-out-message') }}</p>
                </div>
            </template>

            <template #footer="{ toggleModal }">
                <div class="flex justify-end space-x-2">
                    <Button @click="toggleModal(false)">{{ t('cancel') }}</Button>
                    <Button color="danger" @click="confirmSignOut">{{ t('sign-out') }}</Button>
                </div>
            </template>
        </Modal>
    </div>
</template>

<script lang="ts" setup>
    import { StAvatar, StProfileMenu, type StProfileMenuItem } from 'subturtle-ui';
    import { Button } from 'pilotui/elements';
    import { Modal } from 'pilotui/complex';
    import { useProfileStore } from '~/stores/profile';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';

    const { t } = useI18n();
    const router = useRouter();
    const route = useRoute();
    const profileStore = useProfileStore();
    const { isFreemium, baseRemaining } = useVoiceBalance();

    const open = ref(false);
    const showSignOutModal = ref(false);

    // Router knowledge stays in the app — subturtle-ui also ships to the extension, which has
    // no router at all.
    watch(
        () => route.fullPath,
        () => (open.value = false)
    );

    // The appearance strings moved out with the switch — it now sits in the topbar
    // (PartialThemeSwitch) rather than in an Appearance row here.
    const labels = computed(() => ({ menu: t('account.menu') }));

    const planLabel = computed(() => {
        if (profileStore.isSubscriptionFetching) return undefined;
        return profileStore.isFreemium ? 'Free' : profileStore.activeSubscription?.label || undefined;
    });

    /**
     * The Subscription row's trailing meta: voice minutes for a paid plan, save count on Free.
     * Returns undefined — so the row simply renders without a meta — whenever the subscription
     * has not resolved or the field is missing. A placeholder here would read as a real number.
     */
    const subscriptionMeta = computed(() => {
        if (profileStore.isSubscriptionFetching) return undefined;

        if (isFreemium.value) {
            const allocation = profileStore.freemiumAllocation as { allowed_save_words?: number; allowed_save_words_used?: number } | null;
            const total = allocation?.allowed_save_words;
            const used = allocation?.allowed_save_words_used;
            if (typeof total !== 'number' || typeof used !== 'number') return undefined;
            return t('account.saves', { used, total });
        }

        return t('subscription.voice-meter.left-voice', { n: baseRemaining.value });
    });

    const items = computed<StProfileMenuItem[]>(() => [
        { label: t('profile.profile'), icon: 'solar:user-linear', onClick: () => router.push('/settings/profile') },
        { label: t('account.study-settings'), icon: 'solar:settings-linear', onClick: () => router.push('/settings/preferences') },
        {
            label: t('account.subscription'),
            icon: 'solar:crown-linear',
            meta: subscriptionMeta.value,
            onClick: () => router.push('/settings/subscription'),
        },
        {
            label: t('account.sign-out'),
            icon: 'solar:logout-2-linear',
            danger: true,
            dividerBefore: true,
            onClick: () => (showSignOutModal.value = true),
        },
    ]);

    function confirmSignOut() {
        showSignOutModal.value = false;
        profileStore.logout();
        // Hard reload after logout: localStorage is now cleared, so the auth middleware on the
        // next boot will detect no session and redirect to /auth/login. This sidesteps
        // vue-router race conditions (queued navigations from the axios 401/412 interceptor or
        // stale post-logout API responses) that were silently aborting in-page redirects.
        window.location.reload();
    }
</script>
