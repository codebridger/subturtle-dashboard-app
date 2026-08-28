<template>
    <div class="relative flex h-full w-full items-center overflow-hidden">
        <!-- Sign-in column. Below lg it centres and the decorative half is dropped, but the
             344px form width is kept so the button never stretches on a tablet. -->
        <div
            class="rise relative z-[2] mx-auto max-h-full w-full max-w-[344px] overflow-y-auto overflow-x-hidden px-6 py-10 lg:mx-0 lg:max-w-none lg:shrink-0 lg:basis-[540px] lg:px-0 lg:pl-20 lg:pr-10"
        >
            <img src="/assets/images/logo.svg" alt="Subturtle" class="h-[46px] w-[46px]" />

            <!-- Destination pill: only when the user was bounced here from somewhere specific,
                 so the promise it makes is one we can keep. -->
            <div
                v-if="destination"
                class="mt-[26px] inline-flex h-[30px] items-center gap-2 rounded-st-pill bg-st-primary-soft px-[13px] text-st-xs font-extrabold text-st-rose-700"
            >
                <StIcon name="solar:arrow-right-bold" :size="14" />
                {{ t('auth.heading-to', { destination }) }}
            </div>

            <h1 class="mt-[18px] max-w-[20rem] font-st-display text-st-2xl font-black leading-[1.06] tracking-st-tight text-st-strong [text-wrap:pretty]">
                {{ t('auth.signin') }}
            </h1>
            <p class="mt-3 max-w-[22rem] text-st-md font-semibold leading-[1.5] text-st-muted [text-wrap:pretty]">
                {{ t('auth.signin_subtitle') }}
            </p>

            <div class="mt-[30px] w-full lg:w-[344px]">
                <InlineNotice v-if="notice === 'expired'" color="warning" class="mb-5" :message="t('auth.notice.expired')" />

                <InlineNotice
                    v-else-if="notice === 'failed'"
                    color="danger"
                    class="mb-5"
                    :title="t('auth.notice.failed.title')"
                    :message="t('auth.notice.failed.message')"
                />

                <StButton v-if="phase === 'idle'" color="primary" size="lg" block @click="triggerGoogleLoginProcess">
                    <span class="inline-flex items-center gap-[11px]">
                        <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white">
                            <StIcon name="logos:google-icon" :size="14" />
                        </span>
                        {{ t('auth.signin_with_google') }}
                    </span>
                </StButton>

                <!-- Waiting block. `window.open(url, '_self')` normally navigates away before this
                     is noticed; it earns its place on a slow connection, and the retry link is the
                     way out when the handoff never happens. -->
                <div v-else-if="phase === 'waiting'">
                    <div
                        class="flex h-[52px] items-center justify-center gap-3 rounded-st-md border-[1.5px] border-st-line bg-st-card text-st-base font-extrabold text-st-muted"
                    >
                        <span class="spin inline-block h-[17px] w-[17px] rounded-full border-[2.5px] border-st-ink-200 border-t-st-primary" />
                        {{ t('auth.waiting.label') }}
                    </div>
                    <p class="mt-3.5 text-st-sm font-semibold leading-[1.55] text-st-muted [text-wrap:pretty]">
                        {{ t('auth.waiting.hint') }}
                        <button type="button" class="st-focus-ring rounded-st-sm font-bold text-st-link hover:underline" @click="triggerGoogleLoginProcess">
                            {{ t('auth.waiting.retry') }}
                        </button>
                    </p>
                </div>

                <div class="my-[26px] h-px bg-st-line" />

                <p class="text-st-sm font-semibold leading-[1.55] text-st-body [text-wrap:pretty]">
                    {{ t('auth.no-account') }}
                    <button type="button" class="st-focus-ring rounded-st-sm font-bold text-st-link hover:underline" @click="triggerGoogleLoginProcess">
                        {{ t('auth.no-account-cta') }}
                    </button>
                </p>

                <p class="mt-[22px] flex flex-wrap gap-x-1.5 text-st-xs font-semibold text-st-faint">
                    <template v-for="(link, i) in footerLinks" :key="link.href">
                        <span v-if="i > 0" aria-hidden="true">·</span>
                        <a
                            :href="link.href"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="st-focus-ring rounded-st-sm font-bold text-st-link hover:underline"
                        >
                            {{ link.label }}
                        </a>
                    </template>
                </p>
            </div>
        </div>

        <LoginBoardPreview />

        <!-- Handoff overlay: shown while an already-valid session is being sent on its way, so
             the login form never flashes at someone who is in fact signed in. -->
        <div
            v-if="phase === 'returning'"
            class="absolute inset-0 z-[5] flex items-center justify-center bg-st-page/[0.86] backdrop-blur-[10px]"
            role="status"
            aria-live="polite"
        >
            <div class="flex flex-col items-center gap-5">
                <img src="/assets/images/logo.svg" alt="" class="pulse h-14 w-14" />
                <div class="text-center">
                    <div class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">{{ t('auth.returning.title') }}</div>
                    <p class="mt-[7px] text-st-sm font-semibold text-st-muted">
                        {{ t('auth.returning.subtitle', { destination: destination || t('auth.destination-default') }) }}
                    </p>
                </div>
                <div class="h-1.5 w-[180px] overflow-hidden rounded-st-pill bg-st-ink-150">
                    <span class="block h-full w-[64%] rounded-st-pill bg-st-primary" />
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { useRouter, useRoute } from 'vue-router';
    import { computed, onMounted, ref } from 'vue';
    import { StButton, StIcon } from 'subturtle-ui';
    import { authentication } from '@modular-rest/client';
    import InlineNotice from '~/components/common/InlineNotice.vue';
    import LoginBoardPreview from '~/components/auth/LoginBoardPreview.vue';
    import { activeNavId, useDashboardNavigatorItems } from '~/composables/useDashboardNavigatorItems';

    const { t } = useI18n();

    useHead({ title: t('auth.login_page') });

    const router = useRouter();
    const route = useRoute();
    const runtimeConfig = useRuntimeConfig();

    definePageMeta({
        layout: 'auth-redesign',
    });

    /**
     * idle → the form. waiting → Google handoff in flight. returning → an existing session is
     * being forwarded. The two notices are orthogonal: they render above an idle form.
     */
    const phase = ref<'idle' | 'waiting' | 'returning'>('idle');

    /** `?notice=expired` comes from the 401/412 interceptor, `?notice=failed` from login_with_token. */
    const notice = computed(() => {
        const value = route.query.notice;
        return value === 'expired' || value === 'failed' ? value : null;
    });

    // The pill and the overlay both name where the user is headed. Resolved from the same nav
    // definition the sidebar uses, so the two can never drift.
    const navGroups = useDashboardNavigatorItems();
    const destination = computed(() => {
        const redirectUrl = route.query.redirect as string;
        if (!redirectUrl) return null;

        const id = activeNavId(redirectUrl.split('?')[0].split('#')[0]);
        if (!id) return null;

        for (const group of navGroups.value) {
            const item = group.items.find((i) => i.id === id);
            if (item) return item.label;
        }
        return null;
    });

    const footerLinks = computed(() =>
        [
            { href: runtimeConfig.public.termsUrl as string, label: t('auth.terms') },
            { href: runtimeConfig.public.privacyUrl as string, label: t('auth.privacy') },
            { href: runtimeConfig.public.chromeWebStoreUrl as string, label: t('auth.chrome-extension') },
        ].filter((link) => !!link.href)
    );

    // Handle redirect parameter
    onMounted(() => {
        const redirectUrl = route.query.redirect as string;
        if (redirectUrl) {
            // Store redirect URL in session storage
            sessionStorage.setItem('auth_redirect_url', redirectUrl);
        }

        // If a real user session is already active, don't show the login screen
        // and don't clobber the in-memory user token with an anonymous one.
        if (authentication.isLogin) {
            phase.value = 'returning';
            router.replace(redirectUrl || '/');
            return;
        }

        // Only prime an anonymous token when no token is loaded yet — keeps
        // anonymous-allowed routes usable from the login page without
        // overwriting an existing authenticated session.
        if (!authentication.getToken) {
            authentication.loginAsAnonymous();
        }
    });

    function triggerGoogleLoginProcess() {
        const config = useRuntimeConfig();
        const redirectUrl = route.query.redirect as string;

        let url = `${config.public.BASE_URL_API}/auth/google`;

        // Pass redirect parameter to backend if present
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const params: Record<string, string> = { timezone: timeZone };

        if (redirectUrl) {
            params.redirect = redirectUrl;
        }

        const urlParams = new URLSearchParams(params);
        url += `?${urlParams.toString()}`;

        phase.value = 'waiting';
        window.open(url, '_self');
    }
</script>

<style scoped>
    /*
     * The three motions the design specifies. Tailwind can express none of them without adding
     * keyframes to the app-wide config for one screen, and all three are inert under
     * prefers-reduced-motion.
     */
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 0.45;
            transform: scale(0.94);
        }
        50% {
            opacity: 1;
            transform: scale(1);
        }
    }

    @keyframes riseIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .spin {
        animation: spin 900ms linear infinite;
    }

    .pulse {
        animation: pulse 1.6s var(--ease-in-out) infinite;
    }

    .rise {
        animation: riseIn var(--dur-slow) var(--ease-out) both;
    }

    @media (prefers-reduced-motion: reduce) {
        .spin,
        .pulse,
        .rise {
            animation: none;
        }
    }
</style>
