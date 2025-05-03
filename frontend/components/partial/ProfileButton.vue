<template>
    <Dropdown :triggerText="''" :offsetDistance="7">
        <template #trigger>
            <IconButton size="lg" :imgUrl="profilePicture" />
        </template>

        <template #body="{ close }">
            <ul class="w-[230px] !py-0 font-semibold text-dark dark:text-white-dark dark:text-white-light/90">
                <li>
                    <div class="flex items-center px-4 py-4">
                        <div class="flex-none">
                            <img class="h-10 w-10 rounded-md object-cover" :src="profilePicture" />
                        </div>
                        <div class="truncate ltr:pl-4 rtl:pr-4">
                            <h4 class="text-base">
                                {{ profileStore.userDetail?.name }}
                                <!-- <span class="rounded bg-success-light px-1 text-xs text-success ltr:ml-2 rtl:ml-2">Pro</span> -->
                            </h4>
                            <span class="text-black/60 dark:text-dark-light/60 dark:hover:text-white">
                                {{ profileStore.email }}
                            </span>
                        </div>
                    </div>
                </li>
                <li class="cursor-pointer">
                    <a
                        class="dark:hover:text-white"
                        @click="
                            close();
                            goToMembership();
                        "
                    >
                        <Icon name="IconDollarSignCircle" class="h-4.5 w-4.5 shrink-0 ltr:mr-2 rtl:ml-2" />
                        {{ t('subscription.title') }}
                    </a>
                </li>
                <li class="cursor-pointer border-t border-white-light dark:border-white-light/10">
                    <a to="/auth/boxed-signin" class="!py-3 text-danger" @click="logout">
                        <Icon name="icon-logout" class="h-4.5 w-4.5 shrink-0 rotate-90 ltr:mr-2 rtl:ml-2" />
                        {{ t('sign-out') }}
                    </a>
                </li>
            </ul>
        </template>
    </Dropdown>
</template>

<script lang="ts" setup>
    import { useProfileStore } from '@/stores/profile';
    import { Dropdown, IconButton, Icon } from '@codebridger/lib-vue-components/elements.ts';

    const router = useRouter();
    const { t } = useI18n();

    const profileStore = useProfileStore();

    const profilePicture = computed(() => {
        return profileStore.profilePicture || '/assets/images/user.png';
    });

    function logout() {
        profileStore.logout();
        router.push('/auth/login');
    }

    function goToMembership() {
        router.push('/settings/subscription');
    }
</script>
