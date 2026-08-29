<template>
    <!--
        This screen renders inside `layouts/auth.vue`, which is still pilotui and contributes no
        height, background or type of its own — so the page establishes all three here. It is
        exactly the viewport and clips its own overflow, because the board preview is positioned
        past the right edge.
    -->
    <div class="relative flex h-[100dvh] w-full items-center overflow-hidden bg-st-page font-st-sans text-st-body">
        <!-- Ambient brand wash, purely decorative and behind everything. A radial gradient is
             the one thing the `st-` token namespace cannot express, so it reads the custom
             properties directly. -->
        <span
            aria-hidden="true"
            class="pointer-events-none absolute -right-[220px] -top-[320px] h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,rgb(var(--rose-500)/0.09),transparent_62%)]"
        />
        <span
            aria-hidden="true"
            class="pointer-events-none absolute -bottom-[260px] -left-[180px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgb(var(--jade-500)/0.08),transparent_62%)]"
        />

        <!-- Sign-in column. Below xl it centres and the decorative half is dropped (see
             LoginBoardPreview for why xl), but the 344px form width is kept so the button never
             stretches across a tablet. -->
        <div
            class="rise relative z-[2] mx-auto max-h-full w-full max-w-[344px] overflow-y-auto overflow-x-hidden px-6 py-10 xl:mx-0 xl:max-w-none xl:shrink-0 xl:basis-[540px] xl:px-0 xl:pl-20 xl:pr-10"
        >
            <img src="/assets/images/logo.svg" alt="Subturtle" class="h-[46px] w-[46px]" />

            <!-- Only shown when the user was bounced here from somewhere specific, so the
                 promise it makes is one the redirect can actually keep. -->
            <div
                v-if="hasRedirect"
                class="mt-[26px] inline-flex h-[30px] items-center gap-2 rounded-st-pill bg-st-primary-soft px-[13px] text-st-xs font-extrabold text-st-rose-700"
            >
                <StIcon name="solar:arrow-right-bold" :size="14" />
                {{ t('auth.heading-back') }}
            </div>

            <h1 class="mt-[18px] max-w-[20rem] font-st-display text-st-2xl font-black leading-[1.06] tracking-st-tight text-st-strong [text-wrap:pretty]">
                {{ t('auth.signin') }}
            </h1>
            <p class="mt-3 max-w-[22rem] text-st-md font-semibold leading-[1.5] text-st-muted [text-wrap:pretty]">
                {{ t('auth.signin_subtitle') }}
            </p>

            <div class="mt-[30px] w-full xl:w-[344px]">
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

                <!-- Waiting block. `window.open(url, '_self')` normally navigates away before
                     this is noticed; it earns its place on a slow connection, and the retry link
                     is the way out when the handoff never happens at all. -->
                <div v-else-if="phase === 'waiting'">
                    <div
                        class="flex h-[52px] items-center justify-center gap-3 rounded-st-md border-[1.5px] border-st-line bg-st-card text-st-base font-extrabold text-st-muted"
                        role="status"
                        aria-live="polite"
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

                <p class="mt-[22px] text-st-xs font-semibold text-st-faint">
                    <a
                        :href="chromeWebStoreUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="st-focus-ring rounded-st-sm font-bold text-st-link hover:underline"
                    >
                        {{ t('auth.chrome-extension') }}
                    </a>
                </p>
            </div>
        </div>

        <LoginBoardPreview />

        <!-- Handoff overlay: shown while an already-valid session is being forwarded, so the
             sign-in form never flashes at someone who is in fact signed in. -->
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
                    <p class="mt-[7px] text-st-sm font-semibold text-st-muted">{{ t('auth.returning.subtitle') }}</p>
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

    const { t } = useI18n();

    useHead({ title: t('auth.login_page') });

    const router = useRouter();
    const route = useRoute();
    const runtimeConfig = useRuntimeConfig();

    definePageMeta({
        layout: 'auth',
    });

    /**
     * Which of the three views the column shows. `idle` is the form, `waiting` is the Google
     * handoff in flight, `returning` is an existing session being forwarded. Purely presentational
     * — none of it gates the sign-in logic below.
     */
    const phase = ref<'idle' | 'waiting' | 'returning'>('idle');

    /**
     * The two notice states, read straight off the URL and orthogonal to `phase` — both render
     * above an idle form. Nothing produces `?notice=` yet: `login_with_token.vue` still toasts
     * its failure and the 401/412 interceptor still bounces here silently. Wiring either of them
     * to `?notice=failed` / `?notice=expired` is a one-line change in those files that needs no
     * change here.
     */
    const notice = computed(() => {
        const value = route.query.notice;
        return value === 'expired' || value === 'failed' ? value : null;
    });

    const hasRedirect = computed(() => !!route.query.redirect);

    const chromeWebStoreUrl = computed(() => runtimeConfig.public.chromeWebStoreUrl as string);

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
     * The three motions the design specifies. None is expressible in Tailwind without adding
     * keyframes to the app-wide config for the sake of one screen, and all three are inert
     * under prefers-reduced-motion.
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
