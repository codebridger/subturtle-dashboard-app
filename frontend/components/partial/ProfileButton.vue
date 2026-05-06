<template>
    <div>
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
                                </h4>
                                <span class="text-black/60 dark:text-dark-light/60 dark:hover:text-white">
                                    {{ profileStore.email }}
                                </span>
                            </div>
                        </div>
                    </li>
                    <li class="cursor-pointer">
                        <a class="dark:hover:text-white" @click="
                            close();
                        goToProfileSettings();
                        ">
                            <Icon name="IconUser" class="h-4.5 w-4.5 shrink-0 ltr:mr-2 rtl:ml-2" />
                            {{ t('profile.profile') }}
                        </a>
                    </li>
                    <li class="cursor-pointer">
                        <a class="dark:hover:text-white" @click="
                            close();
                        goToLeitnerSettings();
                        ">
                            <Icon name="IconSettings" class="h-4.5 w-4.5 shrink-0 ltr:mr-2 rtl:ml-2" />
                            {{ t('smart_review.settings') }}
                        </a>
                    </li>
                    <li class="cursor-pointer border-t border-white-light dark:border-white-light/10">
                        <a class="flex items-center !py-3 text-danger ltr:pl-5 rtl:pr-5" @click="
                            close();
                        showSignOutModal = true;
                        ">
                            <Icon name="icon-logout" class="h-4.5 w-4.5 shrink-0 rotate-90 ltr:mr-2 rtl:ml-2" />
                            {{ t('sign-out') }}
                        </a>
                    </li>
                </ul>
            </template>
        </Dropdown>

        <!-- Sign Out Confirmation Modal -->
        <!-- Rendered outside the Dropdown so its <ul @click="close()"> doesn't
             unmount the modal before it has a chance to display. -->
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
import { useProfileStore } from '@/stores/profile';
import { Dropdown, IconButton, Icon, Button } from 'pilotui/elements';
import { Modal } from 'pilotui/complex';

const router = useRouter();
const { t } = useI18n();

const profileStore = useProfileStore();

const showSignOutModal = ref(false);

const profilePicture = computed(() => {
    return profileStore.profilePicture || '/assets/images/user.png';
});

function confirmSignOut() {
    showSignOutModal.value = false;
    profileStore.logout();
    // Hard reload after logout: localStorage is now cleared, so the auth
    // middleware on the next boot will detect no session and redirect to
    // /auth/login. This sidesteps vue-router race conditions (queued
    // navigations from the axios 401/412 interceptor or stale post-logout
    // API responses) that were silently aborting in-page redirects.
    window.location.reload();
}

function goToProfileSettings() {
    router.push('/settings/profile');
}

function goToLeitnerSettings() {
    router.push('/settings/preferences');
}
</script>
