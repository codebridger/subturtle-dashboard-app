<template>
    <div class="container mx-auto p-4">
        <div class="flex gap-4">
            <div class="w-1/5">
                <ProfileSidebar activeTab="subscription" />
            </div>
            <div class="flex w-4/5 flex-col gap-4">
                <!-- Active Plan Card -->
                <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
                    <h2 class="text-xl font-bold text-gray-900">
                        {{ subscriptionData ? subscriptionData.status.charAt(0).toUpperCase() + subscriptionData.status.slice(1) : '' }}
                        {{ t('subscription.plan') }}
                    </h2>
                    <div v-if="subscriptionData">
                        <div class="flex flex-col gap-4">
                            <div class="mt-8 flex items-start justify-between gap-4">
                                <div class="flex flex-col gap-2.5">
                                    <span class="text-lg text-gray-800">{{ t('subscription.freemium') }}</span>
                                    <div class="flex items-center">
                                        <span class="text-lg text-gray-900">$0</span>
                                        <span class="text-sm text-gray-500 ltr:ml-1 rtl:mr-1">/month</span>
                                    </div>
                                </div>
                                <div class="flex flex-col gap-2.5">
                                    <p class="text-gray-600">
                                        {{ t('subscription.started-at') }} {{ new Date(subscriptionData.start_date).toLocaleDateString() }}
                                    </p>
                                    <Button color="primary" size="md" @click="initiateCheckout" :label="t('subscription.cancel-subscription')" />
                                </div>
                            </div>
                            <ul class="space-y-2.5">
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">Usage percentage: {{ subscriptionData.usage_percentage + '%' }}</span>
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700"
                                        >Created at: {{ subscriptionData.createdAt ? new Date(subscriptionData.createdAt).toLocaleDateString() : '' }}</span
                                    >
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700"
                                        >Updated at: {{ subscriptionData.updatedAt ? new Date(subscriptionData.updatedAt).toLocaleDateString() : '' }}</span
                                    >
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700"
                                        >End date: {{ subscriptionData.end_date ? new Date(subscriptionData.end_date).toLocaleDateString() : '' }}</span
                                    >
                                </li>
                            </ul>
                        </div>
                        <div class="mt-8 flex flex-col items-start justify-between gap-4">
                            <div class="flex items-center gap-2 rounded-full bg-gray-600 px-3 py-1.5 text-sm font-medium text-white">
                                <Icon name="IconClock" class="h-4 w-4" />
                                <span>{{ t('billing.days-left') }}: {{ subscriptionData.remaining_days }}</span>
                            </div>
                            <Progress :value="50" :max="100" size="md" color="primary" />
                        </div>
                    </div>
                </Card>
                <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
                    <h2 class="text-xl font-bold text-gray-900">Credit Infomation(dev)</h2>
                    <!-- Credits and USD Table -->
                    <div class="mt-6" v-if="subscriptionData">
                        <div class="overflow-x-auto">
                            <table class="w-full table-auto border-collapse">
                                <thead>
                                    <tr class="border-b border-gray-200">
                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{ t('subscription.metric') }}</th>
                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{ t('subscription.credits') }}</th>
                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{ t('subscription.credit-in-usd') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="border-b border-gray-200">
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.total') }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ subscriptionData.total_credits }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ subscriptionData.total_credit_in_usd }}</td>
                                    </tr>
                                    <tr class="border-b border-gray-200">
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.available') }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ subscriptionData.available_credit }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">${{ subscriptionData.available_credit_in_usd }}</td>
                                    </tr>
                                    <tr>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.used') }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">{{ subscriptionData.credits_used }}</td>
                                        <td class="px-4 py-2 text-sm text-gray-700">${{ subscriptionData.used_credit_in_usd }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Card>

                <!-- Pricing Tables -->
                <div class="mx-auto mt-8 max-w-full dark:text-white-dark">
                    <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
                        <!-- Plan Cards -->
                        <Card
                            v-for="(plan, index) in plans"
                            :key="index"
                            class="group flex h-full w-full flex-col rounded border border-[#e0e6ed] !p-1 shadow-none transition-all duration-300 dark:border-[#1b2e4b]"
                            style="min-height: 440px"
                        >
                            <div class="border-b border-[#e0e6ed] p-2 dark:border-[#1b2e4b]">
                                <div
                                    class="-mt-[30px] flex h-[70px] w-[150px] items-center justify-center rounded border-2 border-blue-600 bg-white text-sm text-[#3b3f5c] shadow-[0_0_15px_1px_rgba(37,99,235,0.20)] transition-all duration-300 group-hover:-translate-y-[10px] dark:bg-[#0e1726] dark:text-white-light"
                                >
                                    <span class="-mt-1 text-lg font-semibold"> {{ plan.price }} </span>/
                                    <span class="-mb-1 text-sm"> {{ t('subscription.month') }} </span>
                                </div>
                                <h3 class="mb-2.5 mt-4 text-xl lg:text-xl">{{ t(`subscription.${plan.name}`) }}</h3>
                                <p class="text-sm">{{ t('subscription.monthly-description') }}</p>
                            </div>
                            <div class="flex flex-grow flex-col p-2">
                                <ul class="mb-8 flex-grow space-y-4 font-semibold">
                                    <li v-for="feature in plan.features" :key="feature" class="flex items-start">
                                        <Icon name="IconCheck" class="mr-3 mt-1 text-xl text-blue-600" />
                                        <span>{{ feature }}</span>
                                    </li>
                                </ul>
                                <div class="mt-auto">
                                    <Button v-if="plan.name === 'freemium'" block disabled>
                                        {{ t('subscription.current-plan') }}
                                    </Button>
                                    <Button v-else @click="initiateCheckout" color="primary" block :disabled="isLoading">
                                        <span v-if="isLoading" class="flex items-center justify-center">
                                            <svg
                                                class="-ml-1 mr-3 h-5 w-5 animate-spin text-white"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                                <path
                                                    class="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                            {{ t('subscription.processing') }}
                                        </span>
                                        <span v-else>
                                            {{ t('subscription.upgrade-plan') }}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>

                <!-- Payment Status Messages -->
                <div v-if="error" class="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
                    {{ error }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Card, Button, Progress, Icon } from '@codebridger/lib-vue-components/elements.ts';

    import { ref } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    import type { SubscriptionType } from '~/types/database.type';
    const { t } = useI18n();
    const isLoading = ref(false);
    const error = ref('');

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.subscription-plans'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const plans = ref([
        {
            name: 'freemium',
            price: 0,
            features: ['10,000 saved phrases', 'Unlimited AI practice sessions', '2 Years Data Storage'],
        },
        {
            name: 'premium',
            price: 10,
            features: ['10,000 saved phrases', 'Unlimited AI practice sessions', '2 Years Data Storage'],
        },
        {
            name: 'pro',
            price: 10,
            features: ['10,000 saved phrases', 'Unlimited AI practice sessions', '2 Years Data Storage'],
        },
    ]);

    // Define checkout response type
    interface CheckoutResponse {
        sessionId: string;
        url: string;
        expiresAt: string;
    }

    const subscriptionData = ref<SubscriptionType | null>(null);
    const isSubscriptionLoading = ref(true);

    function fetchSubscription() {
        isSubscriptionLoading.value = true;
        functionProvider
            .run<SubscriptionType | null>({
                name: 'getSubscriptionDetails',
                args: {
                    userId: authUser.value?.id,
                },
            })
            .then((res) => {
                console.log(res);
                subscriptionData.value = res;
            })
            .catch((err) => {
                console.error('Error fetching subscription:', err);
                error.value = t('subscription.fetch-error');
            })
            .finally(() => {
                isSubscriptionLoading.value = false;
            });
    }

    onMounted(() => {
        fetchSubscription();
    });

    // Function to initiate the checkout process
    async function initiateCheckout() {
        isLoading.value = true;
        error.value = '';

        try {
            // Get the base URL for success/cancel redirects
            const baseUrl = window.location.origin;
            const successUrl = `${baseUrl}/#/payment-success`;
            const cancelUrl = `${baseUrl}/#/payment-canceled`;

            // Call the API to create a payment session using functionProvider
            const response = await functionProvider.run<CheckoutResponse>({
                name: 'createPaymentSession',
                args: {
                    productId: 'prod_S4nM68SkuYEHxm', // Use the Stripe product ID
                    successUrl,
                    cancelUrl,
                    userId: authUser.value?.id,
                },
            });

            // Redirect to Stripe checkout
            if (response && response.url) {
                window.location.href = response.url;
            } else {
                throw new Error(t('subscription.checkout-failed'));
            }
        } catch (err: any) {
            error.value = err.message || t('subscription.unexpected-error');
            console.error('Checkout error:', err);
        } finally {
            isLoading.value = false;
        }
    }
</script>
