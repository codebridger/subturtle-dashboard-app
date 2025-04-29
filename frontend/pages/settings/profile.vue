<template>
    <div class="container mx-auto px-4 py-8">
        <h1 class="mb-8 text-3xl font-bold">
            {{ t('profile.profile') }}
        </h1>
        <div class="flex gap-8">
            <div class="w-1/4">
                <Card class="shadow-none">
                    <div class="flex flex-col">
                        <div class="flex items-center text-center">
                            <Icon name="IconUser" />
                            <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Profile</h3>
                        </div>
                        <div class="my-4 h-px w-full border-b border-[#e0e6ed] dark:border-[#1b2e4b]"></div>
                        <div class="flex items-center text-center">
                            <Icon name="IconCashBanknotes" />
                            <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Subscription</h3>
                        </div>
                        <div class="my-4 h-px w-full border-b border-[#e0e6ed] dark:border-[#1b2e4b]"></div>
                        <div class="flex items-center text-center">
                            <Icon name="IconClipboardText" />
                            <h3 class="text-lg font-semibold ltr:ml-3 rtl:mr-3">Billing</h3>
                        </div>
                    </div>
                </Card>
            </div>
            <div class="flex w-3/4 flex-col gap-4">
                <div class="col-span-1">
                    <Card class="shadow-none"> //(Profile, Subscription, Billing) header </Card>
                </div>
                <div class="col-span-1">
                    <Card class="shadow-none"> //(Profile, Subscription, Billing) body </Card>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts" setup>
    import { Card, Icon } from '@codebridger/lib-vue-components/elements.ts';
    const { t } = useI18n();
    definePageMeta({
        layout: 'default',
        title: () => t('profile.profile'),
        // @ts-ignore
        middleware: ['auth'],
    });

    function selectedTab(tab: string) {
        console.log(tab);
    }
</script>
