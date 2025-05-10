<template>
    <div class="p-4">
        <div class="flex flex-col gap-8">
            <!-- Subscription Summary -->
            <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
                <div class="flex flex-col">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col gap-4">
                            <div>
                                <span class="text-xl font-semibold text-gray-800">{{ t('subscription.premium') }}</span>
                                <div class="mt-1 flex items-center">
                                    <span class="text-lg text-gray-900">$9.99</span>
                                    <span class="ml-1 text-sm text-gray-500">/month</span>
                                </div>
                            </div>

                            <ul class="space-y-2.5">
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">10,000 saved phrases</span>
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">Unlimited AI practice sessions</span>
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">2 Years Data Storage</span>
                                </li>
                            </ul>
                        </div>
                        <div class="flex flex-col gap-4">
                            <span class="text-md font-medium text-gray-700"> {{ t('billing.next-billing-date') }}: {{ new Date().toLocaleDateString() }} </span>

                            <Button color="primary" size="md" @click="renewPlan" :label="t('billing.renew-now')" class="w-full" />
                        </div>
                    </div>
                    <div class="mt-8 flex items-center gap-2">
                        <div class="flex w-[140px] items-center gap-2 rounded-full bg-gray-600 p-1.5 text-sm text-white">
                            <Icon name="IconClock" class="h-4 w-4" />
                            <span>{{ t('billing.days-left') }}: 10</span>
                        </div>
                        <Progress :value="50" :max="100" size="md" color="primary" />
                    </div>
                </div>
            </Card>
            <!-- Payment list -->
            <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
                <div class="flex flex-col">
                    <h2 class="mb-4 text-xl font-semibold text-gray-900">{{ t('billing.payment-history') }}</h2>
                    <div class="overflow-x-auto">
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="border-b border-gray-200">
                                    <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">{{ t('billing.invoice-number') }}</th>
                                    <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">{{ t('billing.date') }}</th>
                                    <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">{{ t('billing.amount') }}</th>
                                    <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">{{ t('billing.status') }}</th>
                                    <th class="px-4 py-3 text-right text-sm font-medium text-gray-600"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="item in invoiceItems" :key="item.id" class="border-b border-gray-100 hover:bg-gray-50">
                                    <td class="px-4 py-3 text-sm font-medium text-gray-900">#{{ item.invoice }}</td>
                                    <td class="px-4 py-3 text-sm text-gray-700">{{ item.date }}</td>
                                    <td class="px-4 py-3 text-sm font-medium text-gray-900">${{ item.amount }}</td>
                                    <td class="px-4 py-3">
                                        <span
                                            class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                                            :class="{
                                                'bg-green-100 text-green-800': item.status === 'Paid',
                                                'bg-red-100 text-red-800': item.status === 'Failed',
                                            }"
                                        >
                                            {{ item.status }}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        <IconButton
                                            icon="IconArrowDown"
                                            size="sm"
                                            class="text-indigo-600 hover:text-indigo-800"
                                            @click="downloadInvoice(item.id)"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </Card>
        </div>
    </div>
</template>
<script lang="ts" setup>
    import { Card, Button, Progress, Icon, IconButton } from '@codebridger/lib-vue-components/elements.ts';
    import { ref } from 'vue';
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
