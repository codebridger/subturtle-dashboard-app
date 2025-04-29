<template>
    <Card class="shadow-none">
        <div class="flex flex-col">
            <NuxtLink to="/profile/settings">
                <div class="flex cursor-pointer items-center text-center" :class="{ 'bg-gray-100 dark:bg-gray-800': activeTab === 'settings' }">
                    <Icon name="IconUser" />
                    <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Profile</h3>
                </div>
            </NuxtLink>

            <div class="my-4 h-px w-full border-b border-[#e0e6ed] dark:border-[#1b2e4b]"></div>

            <NuxtLink to="/profile/subscription">
                <div class="flex cursor-pointer items-center text-center" :class="{ 'bg-gray-100 dark:bg-gray-800': activeTab === 'subscription' }">
                    <Icon name="IconCashBanknotes" />
                    <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Subscription</h3>
                </div>
            </NuxtLink>

            <div class="my-4 h-px w-full border-b border-[#e0e6ed] dark:border-[#1b2e4b]"></div>

            <NuxtLink to="/profile/billing">
                <div class="flex cursor-pointer items-center text-center" :class="{ 'bg-gray-100 dark:bg-gray-800': activeTab === 'billing' }">
                    <Icon name="IconClipboardText" />
                    <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Billing</h3>
                </div>
            </NuxtLink>
        </div>
    </Card>
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
