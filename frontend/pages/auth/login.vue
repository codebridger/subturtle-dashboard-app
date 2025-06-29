<template>
    <div class="h-screen overflow-hidden">
        <div class="absolute inset-0">
            <img :src="backgroundImage" alt="background gradient" class="h-full w-full object-cover" />
        </div>
        <div
            :class="`bg-[url(${mapBackgroundImage})]`"
            class="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-8 py-2 dark:bg-[#060818]"
        >
            <img :src="comingSoonObject1" alt="coming soon object 1" class="absolute left-0 top-1/2 h-full max-h-[893px] -translate-y-1/2" />
            <img :src="comingSoonObject2" alt="coming soon object 2" class="absolute left-[30%] top-0 h-40" />
            <img :src="comingSoonObject3" alt="coming soon object 3" class="absolute right-0 top-0 h-[300px]" />
            <img :src="polygonObject" alt="polygon object" class="absolute bottom-0 end-[28%]" />
            <div
                class="relative flex min-h-[758px] w-full max-w-[1502px] flex-row justify-between gap-0 overflow-hidden rounded-md bg-white/60 backdrop-blur-lg dark:bg-black/50"
            >
                <div
                    class="relative -ms-28 inline-flex w-full max-w-[835px] items-center justify-center bg-[#220660] p-5 ltr:skew-x-[14deg] rtl:skew-x-[-14deg]"
                >
                    <div class="ltr:-skew-x-[14deg] rtl:skew-x-[14deg]">
                        <div class="w-full">
                            <img :src="loginCover" alt="Cover Image" class="w-full" />
                        </div>
                    </div>
                </div>
                <div class="relative flex w-full max-w-[667px] flex-col items-center justify-center gap-6 px-6 pb-16 pt-6">
                    <div class="mx-auto w-full max-w-[440px]">
                        <div class="mb-40">
                            <h1 class="text-3xl font-extrabold uppercase !leading-snug text-primary md:text-4xl">{{ t('auth.signin') }}</h1>
                            <p class="text-base font-bold leading-normal text-white-dark">
                                Use one of your social accounts to {{ t('auth.signin') }} / {{ t('auth.signup') }}.
                            </p>
                        </div>
                        <form class="space-y-5 dark:text-white" @submit.prevent="router.push('/')">
                            <Button
                                @click="triggerGoogleLoginProcess"
                                color="gradient"
                                shadow
                                uppercase
                                block
                                iconName="IconGoogle"
                                :label="t('auth.signin_with_google')"
                            />
                        </form>
                        <div class="relative my-7 text-center md:mb-9">
                            <span class="absolute inset-x-0 top-1/2 h-px w-full -translate-y-1/2 bg-white-light dark:bg-white-dark"></span>
                        </div>
                        <div class="text-center dark:text-white">
                            Don't have an account ?
                            <span class="text-primary"> Just sign in and you will get a new account. </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
    // import { useAppStore } from '@/stores/index';
    import { useRouter } from 'vue-router';
    import { computed } from 'vue';
    import { Button } from '@codebridger/lib-vue-components/elements.ts';

    const { t } = useI18n();

    useHead({ title: t('auth.login_page') });

    const router = useRouter();

    definePageMeta({
        layout: 'auth',
    });

    // const store = useAppStore();
    // const { setLocale } = useI18n();

    // multi language
    //   const changeLanguage = (item: any) => {
    //     appSetting.toggleLanguage(item, setLocale);
    //   };

    //   const currentFlag = computed(() => {
    //     return `/assets/images/flags/${store.locale?.toUpperCase()}.svg`;
    //   });

    const backgroundImage = computed(() => '/assets/images/auth/bg-gradient.png');
    const comingSoonObject1 = computed(() => '/assets/images/auth/coming-soon-object1.png');
    const comingSoonObject2 = computed(() => '/assets/images/auth/coming-soon-object2.png');
    const comingSoonObject3 = computed(() => '/assets/images/auth/coming-soon-object3.png');
    const polygonObject = computed(() => '/assets/images/auth/polygon-object.svg');
    const mapBackgroundImage = computed(() => '/assets/images/auth/map.png');
    const loginCover = computed(() => '/assets/images/auth/login-cover.png');

    function triggerGoogleLoginProcess() {
        const config = useRuntimeConfig();
        const url = `${config.public.BASE_URL_API}/auth/google`;
        window.open(url, '_self');
    }
</script>
