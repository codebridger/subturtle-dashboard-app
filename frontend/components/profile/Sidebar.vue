<template>
    <div class="panel w-[240px] flex-none space-y-4 overflow-hidden p-4">
        <div class="flex h-full flex-col">
            <div class="flex items-center text-center">
                <Icon name="IconUser" class="shrink-0" />
                <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Profile</h3>
            </div>
            <div class="my-4 h-px w-full border-b border-[#e0e6ed] dark:border-[#1b2e4b]"></div>

            <client-only>
                <div class="relative grow ltr:-mr-3.5 ltr:pr-3.5 rtl:-ml-3.5 rtl:pl-3.5">
                    <div class="space-y-1">
                        <NuxtLink to="/profile/settings">
                            <button
                                type="button"
                                class="flex h-10 w-full items-center justify-between rounded-md p-2 font-medium hover:bg-white-dark/10 hover:text-primary dark:hover:bg-[#181F32] dark:hover:text-primary"
                                :class="{ 'bg-gray-100 text-primary dark:bg-[#181F32] dark:text-primary': activeTab === 'settings' }"
                            >
                                <div class="flex items-center">
                                    <Icon name="IconSettings" class="shrink-0" />
                                    <div class="ltr:ml-3 rtl:mr-3">Settings</div>
                                </div>
                            </button>
                        </NuxtLink>

                        <NuxtLink to="/profile/subscription">
                            <button
                                type="button"
                                class="flex h-10 w-full items-center justify-between rounded-md p-2 font-medium hover:bg-white-dark/10 hover:text-primary dark:hover:bg-[#181F32] dark:hover:text-primary"
                                :class="{ 'bg-gray-100 text-primary dark:bg-[#181F32] dark:text-primary': activeTab === 'subscription' }"
                            >
                                <div class="flex items-center">
                                    <Icon name="IconCashBanknotes" class="shrink-0" />
                                    <div class="ltr:ml-3 rtl:mr-3">Subscription</div>
                                </div>
                            </button>
                        </NuxtLink>

                        <NuxtLink to="/profile/billing">
                            <button
                                type="button"
                                class="flex h-10 w-full items-center justify-between rounded-md p-2 font-medium hover:bg-white-dark/10 hover:text-primary dark:hover:bg-[#181F32] dark:hover:text-primary"
                                :class="{ 'bg-gray-100 text-primary dark:bg-[#181F32] dark:text-primary': activeTab === 'billing' }"
                            >
                                <div class="flex items-center">
                                    <Icon name="IconClipboardText" class="shrink-0" />
                                    <div class="ltr:ml-3 rtl:mr-3">Billing</div>
                                </div>
                            </button>
                        </NuxtLink>
                    </div>
                </div>
            </client-only>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { Card, Icon } from '@codebridger/lib-vue-components/elements.ts';

    defineProps({
        activeTab: {
            type: String,
            required: true,
        },
    });

    defineEmits(['update:activeTab']);
</script>
