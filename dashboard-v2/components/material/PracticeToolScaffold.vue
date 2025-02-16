<template>
    <div class="flex h-screen flex-col bg-gray-100">
        <BaseCard rounded="none" class="flex w-full items-center justify-between px-3 py-3">
            <div></div>

            <div class="text-center">
                <p class="font-bold text-gray-600">{{ activePhrase }} / {{ totalPhrases }}</p>
                <h1 class="text-sm text-gray-500">{{ title }}</h1>
            </div>

            <div>
                <BaseButtonIcon rounded="md" color="default" size="md" :to="`/dashboard/bundles/${bundleId}`">
                    <Icon name="ph:x-bold" />
                </BaseButtonIcon>
            </div>
        </BaseCard>

        <section class="flex-1">
            <slot />
        </section>
    </div>
</template>
<script setup lang="ts">
    const props = defineProps<{
        title: string;
        activePhrase: number;
        totalPhrases: number;
        bundleId: string;
    }>();
</script>
