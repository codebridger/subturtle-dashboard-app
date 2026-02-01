<template>
    <div class="relative min-h-screen">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none">
        </div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none">
        </div>

        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <PageHeader :title="t('subscription.subscription-plans')" overline="MEMBERSHIP" />

            <div class="flex flex-col gap-8">
                <!-- Active Plan Card -->
                <Card v-if="activeSubscriptionData !== null" class="w-full rounded-lg border border-gray-100 shadow-sm">
                    <h2 class="text-xl font-bold text-gray-900">
                        {{ activeSubscriptionData.label }}
                    </h2>

                    <div v-if="activeSubscriptionData">
                        <div class="flex flex-col gap-4">
                            <div class="flex items-center justify-between">
                                <p class="text-gray-600">{{ t('subscription.started-at') }} {{ new
                                    Date(activeSubscriptionData.start_date).toLocaleDateString() }}</p>

                                <Button color="primary" size="md" :label="t('subscription.manage-subscription')"
                                    :to="activeSubscriptionData.portal_url" />
                            </div>
                            <ul class="space-y-2.5">
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">Usage percentage: {{
                                        activeSubscriptionData.usage_percentage + '%' }}</span>
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">Created at: {{ activeSubscriptionData.createdAt
                                        ? new Date(activeSubscriptionData.createdAt).toLocaleDateString() : '' }}</span>
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">Updated at: {{ activeSubscriptionData.updatedAt
                                        ? new Date(activeSubscriptionData.updatedAt).toLocaleDateString() : '' }}</span>
                                </li>
                                <li class="flex items-start">
                                    <Icon name="IconCheck" class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span class="text-sm text-gray-700">End date: {{ activeSubscriptionData.end_date ?
                                        new Date(activeSubscriptionData.end_date).toLocaleDateString() : '' }}</span>
                                </li>
                            </ul>
                        </div>
                        <div class="mt-8 flex items-center gap-4">
                            <div
                                class="flex h-8 w-[160px] items-center gap-2 rounded-full bg-gray-600 px-3 py-1.5 text-sm font-medium text-white">
                                <Icon name="IconClock" class="h-4 w-4" />
                                <span>{{ t('billing.days-left') }}: {{ activeSubscriptionData.remaining_days }}</span>
                            </div>
                            <Progress :value="activeSubscriptionData.usage_percentage!" :max="100" size="md"
                                color="primary" />
                        </div>
                    </div>
                </Card>

                <!-- Credit Infomation (Dev Only) -->
                <Card v-if="config.public.isNotProduction" class="w-full rounded-lg border border-gray-100 shadow-sm">
                    <template v-if="activeSubscriptionData !== null">
                        <h2 class="text-xl font-bold text-gray-900">Credit Infomation (Dev Only)</h2>
                        <!-- Credits and USD Table -->
                        <div class="my-6" v-if="activeSubscriptionData">
                            <div class="overflow-x-auto">
                                <table class="w-full table-auto border-collapse">
                                    <thead>
                                        <tr class="border-b border-gray-200">
                                            <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{
                                                t('subscription.metric') }}</th>
                                            <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{
                                                t('subscription.credits') }}</th>
                                            <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">{{
                                                t('subscription.credit-in-usd') }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr class="border-b border-gray-200">
                                            <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.total') }}
                                            </td>
                                            <td class="px-4 py-2 text-sm text-gray-700">{{
                                                activeSubscriptionData.total_credits }}</td>
                                            <td class="px-4 py-2 text-sm text-gray-700">{{
                                                activeSubscriptionData.total_credit_in_usd }}</td>
                                        </tr>
                                        <tr class="border-b border-gray-200">
                                            <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.available')
                                            }}</td>
                                            <td class="px-4 py-2 text-sm text-gray-700">{{
                                                activeSubscriptionData.available_credit }}</td>
                                            <td class="px-4 py-2 text-sm text-gray-700">${{
                                                activeSubscriptionData.available_credit_in_usd }}</td>
                                        </tr>
                                        <tr>
                                            <td class="px-4 py-2 text-sm text-gray-700">{{ t('subscription.used') }}
                                            </td>
                                            <td class="px-4 py-2 text-sm text-gray-700">{{
                                                activeSubscriptionData.credits_used }}</td>
                                            <td class="px-4 py-2 text-sm text-gray-700">${{
                                                activeSubscriptionData.used_credit_in_usd }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </template>

                    <!-- Profile Reset Section -->
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Profile Reset</h3>
                            <p class="mt-1 text-sm text-gray-500">Clear all subscription and freemium data for testing
                                purposes. This action
                                cannot be undone.</p>
                        </div>
                        <Button @click="handleProfileReset" color="danger" :loading="isResetLoading" class="ml-4"> Reset
                            Profile </Button>
                    </div>
                </Card>

                <!-- Pricing Tables -->
                <div class="mt-4 max-w-full dark:text-white-dark">
                    <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
                        <!-- Plan Cards -->
                        <Card v-for="(plan, index) in plans" :key="index"
                            class="group flex h-full w-full flex-col rounded border border-[#e0e6ed] !p-1 shadow-none transition-all duration-300 dark:border-[#1b2e4b]"
                            style="min-height: 440px">
                            <div class="border-b border-[#e0e6ed] p-2 dark:border-[#1b2e4b]">
                                <div
                                    class="-mt-[30px] flex h-[70px] w-[150px] items-center justify-center rounded border-2 border-blue-600 bg-white text-sm text-[#3b3f5c] shadow-[0_0_15px_1px_rgba(37,99,235,0.20)] transition-all duration-300 group-hover:-translate-y-[10px] dark:bg-[#0e1726] dark:text-white-light">
                                    <div>
                                        <span class="-mt-1 text-lg font-semibold"> {{ plan.currency }}{{ plan.price }}
                                        </span>/
                                        <span class="-mb-1 text-sm"> {{ t('subscription.month') }} </span>
                                    </div>
                                </div>
                                <h3 class="mb-2.5 mt-4 text-xl lg:text-xl">{{ plan.name }}</h3>
                                <p class="text-sm">{{ plan.description }}</p>
                            </div>
                            <div class="flex flex-grow flex-col p-2">
                                <ul class="mb-8 flex-grow space-y-4 font-semibold">
                                    <li v-for="feature in plan.features" :key="feature" class="flex items-start">
                                        <Icon name="IconCheck" class="mr-3 mt-1 text-xl text-blue-600" />
                                        <span>{{ feature }}</span>
                                    </li>
                                </ul>
                                <div class="mt-auto">
                                    <template v-if="plan.is_freemium">
                                        <Button v-if="!activeSubscriptionData" block disabled>
                                            {{ t('subscription.current-plan') }}
                                        </Button>

                                        <Button v-if="activeSubscriptionData" block disabled>
                                            {{ t('subscription.downgrade-plan') }}
                                        </Button>
                                    </template>

                                    <template v-if="!plan.is_freemium">
                                        <Button v-if="!activeSubscriptionData"
                                            @click="initiateCheckout(plan.product_id)" color="primary" block>
                                            <span v-if="isLoading" class="flex items-center justify-center">
                                                <svg class="-ml-1 mr-3 h-5 w-5 animate-spin text-white"
                                                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle class="opacity-25" cx="12" cy="12" r="10"
                                                        stroke="currentColor" stroke-width="4"></circle>
                                                    <path class="opacity-75" fill="currentColor"
                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                                                    </path>
                                                </svg>
                                                {{ t('subscription.processing') }}
                                            </span>

                                            <span v-else>
                                                {{ t('subscription.upgrade-plan') }}
                                            </span>
                                        </Button>
                                    </template>
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
import PageHeader from '~/components/common/PageHeader.vue';

import { ref } from 'vue';
import { functionProvider } from '@modular-rest/client';
import type { SubscriptionPlan } from '../../../server/src/modules/subscription/types';
import { useProfileStore } from '~/stores/profile';
const { t } = useI18n();
const isLoading = ref(false);
const isResetLoading = ref(false);
const error = ref('');

const config = useRuntimeConfig();
const profileStore = useProfileStore();

definePageMeta({
    layout: 'default',
    title: () => t('subscription.subscription-plans'),
    // @ts-ignore
    middleware: ['auth'],
});

const plans = ref<SubscriptionPlan[]>([]);

// Define checkout response type
interface CheckoutResponse {
    sessionId: string;
    url: string;
    expiresAt: string;
}

const activeSubscriptionData = computed(() => profileStore.activeSubscription);

function fetchPlans() {
    return functionProvider
        .run<SubscriptionPlan[]>({
            name: 'getSubscriptionPlans',
            args: {},
        })
        .then((res) => {
            plans.value = res;
        });
}

onMounted(() => {
    fetchPlans();
});

// Function to initiate the checkout process
async function initiateCheckout(productId: string) {
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
                productId,
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

async function handleProfileReset() {
    if (!confirm('Are you sure you want to reset your profile? This will clear all subscription and freemium data and cannot be undone.')) {
        return;
    }

    isResetLoading.value = true;
    error.value = '';

    try {
        await functionProvider.run({
            name: 'clearSubscriptionAndFreemium',
            args: {
                userId: profileStore.authUser?.id,
            },
        });

        // Refresh the profile data to reflect changes
        await profileStore.fetchSubscription();

        // Show success message
        alert('Profile reset successfully! All subscription and freemium data has been cleared.');

        // refresh the page
        window.location.reload();
    } catch (err: any) {
        error.value = err.message || 'Failed to reset profile';
        console.error('Profile reset error:', err);
    } finally {
        isResetLoading.value = false;
    }
}
</script>
