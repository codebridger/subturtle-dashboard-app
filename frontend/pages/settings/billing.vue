<template>
    <div class="container mx-auto p-4">
        <div class="flex gap-8">
            <div class="w-1/5">
                <ProfileSidebar activeTab="billing" />
            </div>
            <div class="flex w-4/5 flex-col gap-4">
                <!-- Last Invoice -->
                <Card class="w-full rounded-lg shadow-none">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col items-start justify-start">
                            <h2 class="text-xl font-bold text-gray-900">{{ t('billing.invoice') }}</h2>
                            <span class="text-lg font-semibold text-gray-800">{{ t('subscription.premium') }}</span>
                            <p class="text-gray-600">{{ t('billing.next-billing-date') }} {{ new Date().toLocaleDateString() }}</p>
                        </div>
                        <div class="mt-4 sm:mt-0">
                            <Button color="primary" @click="renewPlan" :label="t('billing.renew')" />
                        </div>
                    </div>
                </Card>
                <!-- Payment list -->
                <div class="panel overflow-x-auto border-[#e0e6ed] px-0 pb-1.5 dark:border-[#1b2e4b]">
                    <div class="datatable invoice-table">
                        <div class="overflow-x-auto">
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr>
                                        <th class="px-4 py-2">{{ t('billing.invoice-number') }}</th>
                                        <th class="px-4 py-2">{{ t('billing.date') }}</th>
                                        <th class="px-4 py-2">{{ t('billing.amount') }}</th>
                                        <th class="px-4 py-2">{{ t('billing.status') }}</th>
                                        <th class="px-4 py-2 text-center"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="item in invoiceItems" :key="item.id" class="whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-800">
                                        <td class="px-4 py-2">#{{ item.invoice }}</td>
                                        <td class="px-4 py-2">{{ item.date }}</td>
                                        <td class="px-4 py-2">${{ item.amount }}</td>
                                        <td class="px-4 py-2">{{ item.status }}</td>
                                        <td class="px-4 py-2">
                                            <IconButton size="sm" icon="IconArrowDown" @click="downloadInvoice(item.id)" />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts" setup>
    import { Card, IconButton, Button } from '@codebridger/lib-vue-components/elements.ts';
    import { ref, computed } from 'vue';
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('billing.billing'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const search = ref('');

    const invoiceItems = ref([
        {
            id: 1,
            invoice: '081451',
            date: '15 Dec 2020',
            amount: '2275.45',
            status: 'Paid',
        },
        {
            id: 2,
            invoice: '081452',
            date: '20 Dec 2020',
            amount: '1044.00',
            status: 'Paid',
        },
        {
            id: 3,
            invoice: '081681',
            date: '27 Dec 2020',
            amount: '20.00',
            status: 'Failed',
        },
        {
            id: 4,
            invoice: '082693',
            date: '31 Dec 2020',
            amount: '344.00',
            status: 'Paid',
        },
        {
            id: 5,
            invoice: '084743',
            date: '03 Jan 2021',
            amount: '405.15',
            status: 'Paid',
        },
    ]);

    const downloadInvoice = (id: number) => {
        console.log(id);
    };

    const renewPlan = () => {
        console.log('Renewing plan');
    };
</script>
