<template>
    <div class="container mx-auto p-4">
        <div class="flex gap-8">
            <div class="w-1/5">
                <ProfileSidebar activeTab="subscription" />
            </div>
            <div class="flex w-4/5 flex-col gap-4">
                <!-- Active Plan Card -->
                <Card class="w-full rounded-lg shadow-none">
                    <div class="flex flex-col items-start justify-start">
                        <h2 class="text-xl font-bold text-gray-900">{{ t('subscription.active-plan') }}</h2>
                        <span class="text-lg font-semibold text-gray-800">{{ t('subscription.freemium') }}</span>
                        <p class="text-gray-600">{{ t('subscription.joined-at') }} {{ new Date().toLocaleDateString() }}</p>
                    </div>
                </Card>

                <!-- Pricing Tables -->
                <div class="mx-auto mt-8 max-w-full dark:text-white-dark">
                    <div class="justify-between space-y-8 md:flex md:space-x-4 md:space-y-0 rtl:space-x-reverse">
                        <!-- Plan Cards -->
                        <Card
                            v-for="(plan, index) in plans"
                            :key="index"
                            class="group w-full rounded border border-[#e0e6ed] !p-0 shadow-none transition-all duration-300 dark:border-[#1b2e4b]"
                        >
                            <div class="border-b border-[#e0e6ed] p-5 pt-0 dark:border-[#1b2e4b]">
                                <span
                                    class="-mt-[30px] flex h-[70px] w-[70px] items-center justify-center rounded border-2 border-blue-600 bg-white text-xl font-bold text-[#3b3f5c] shadow-[0_0_15px_1px_rgba(37,99,235,0.20)] transition-all duration-300 group-hover:-translate-y-[10px] dark:bg-[#0e1726] dark:text-white-light lg:h-[100px] lg:w-[100px] lg:text-3xl"
                                    >{{ plan.price }}</span
                                >
                                <h3 class="mb-2.5 mt-4 text-xl lg:text-2xl">{{ t(`subscription.${plan.name}`) }}</h3>
                                <p class="text-[15px]">{{ t('subscription.monthly-description') }}</p>
                            </div>
                            <div class="p-5">
                                <ul class="mb-5 space-y-2.5 font-semibold">
                                    <li v-for="(feature, featureIndex) in plan.features" :key="featureIndex" class="flex items-start">
                                        <span :class="`iconify mr-3 mt-1 text-xl text-blue-600 ${feature.icon}`"></span>
                                        <span>{{ feature.text }}</span>
                                    </li>
                                </ul>
                                <Button v-if="plan.name === 'freemium'" class="btn btn-primary hidden w-full" disabled>
                                    {{ t('subscription.current-plan') }}
                                </Button>
                                <Button v-else @click="initiateCheckout" class="btn btn-primary block w-full" :disabled="isLoading">
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
                                        {{ t('subscription.subscribe-now') }}
                                    </span>
                                </Button>
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
    import { Card, Button } from '@codebridger/lib-vue-components/elements.ts';

    import { ref } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    const { t } = useI18n();
    const isLoading = ref(false);
    const error = ref('');

    // Plan options defined as JSON
    const plans = ref([
        {
            name: 'freemium',
            price: '£0',
            features: [
                {
                    icon: 'solar--check-circle-bold',
                    text: `${t('subscription.credits')}: 500`,
                },
                {
                    icon: 'solar--check-circle-bold',
                    text: `${t('subscription.duration')}: 30 ${t('subscription.days')}`,
                },
                {
                    icon: 'solar--check-circle-bold',
                    text: 'Basic AI coaching',
                },
                {
                    icon: 'solar--check-circle-bold',
                    text: 'Limited practice sessions',
                },
            ],
        },
        {
            name: 'premium',
            price: '£7.6',
            features: [
                {
                    icon: 'solar--check-circle-bold',
                    text: `${t('subscription.credits')}: 1000`,
                },
                {
                    icon: 'solar--chat-round-live-bold',
                    text: 'Live session and practice with AI',
                },
                {
                    icon: 'solar--document-add-bold',
                    text: 'Auto Lecture Generator',
                },
                {
                    icon: 'solar--phone-calling-rounded-bold',
                    text: 'AI coach on Telegram with Call',
                },
            ],
        },
    ]);

    definePageMeta({
        layout: 'default',
        title: () => t('subscription.subscription-plans'),
        // @ts-ignore
        middleware: ['auth'],
    });

    // Define response type interface
    interface CheckoutResponse {
        sessionId: string;
        url: string;
        expiresAt: string;
    }

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
