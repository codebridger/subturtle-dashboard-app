<template>
    <div class="container mx-auto px-4 py-12">
        <div class="mx-auto max-w-lg overflow-hidden rounded-lg bg-white shadow-md">
            <div class="p-6">
                <div class="text-center">
                    <div class="mb-4 text-yellow-500">
                        <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 class="mb-4 text-2xl font-semibold">{{ t('payment-canceled') }}</h2>
                    <p class="mb-6 text-gray-600">{{ t('payment-canceled-message') }}</p>
                    <div class="flex justify-center space-x-4">
                        <NuxtLink
                            to="/membership-plans"
                            class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md transition duration-300 hover:bg-blue-700"
                        >
                            {{ t('try-again') }}
                        </NuxtLink>
                        <NuxtLink
                            to="/"
                            class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 shadow-md transition duration-300 hover:bg-gray-300"
                        >
                            {{ t('go-home') }}
                        </NuxtLink>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('payment-canceled'),
        // @ts-ignore
        // middleware: ['auth'],
    });
</script>
