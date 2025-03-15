<template>
    <TransitionGroup name="fade" tag="div">
        <div v-if="isLoading" class="flex h-screen flex-col items-center justify-center">
            <div class="flex h-full w-full items-center justify-center">
                <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-gray-900"></div>
            </div>
        </div>

        <div v-else-if="errorMode && !isLoading" class="flex h-screen flex-col items-center justify-center">
            <slot name="error-mode" />
        </div>

        <div class="flex h-screen flex-col" v-else-if="!errorMode && !isLoading">
            <Card rounded="none" class="flex w-full items-center justify-between px-3 py-3">
                <div></div>

                <div class="text-center">
                    <p class="font-bold text-gray-600">{{ activePhrase }} / {{ totalPhrases }}</p>
                    <h1 class="text-sm text-gray-500">{{ title }}</h1>
                </div>

                <div>
                    <Button rounded="md" size="md" iconName="IconX" :to="`/bundles/${bundleId}`" />
                </div>
            </Card>

            <section :class="['flex-1', bodyClass]">
                <slot />
            </section>
        </div>
    </TransitionGroup>
</template>
<script setup lang="ts">
    import { Card, Button } from '@codebridger/lib-vue-components/elements.ts';

    defineProps<{
        title: string;
        activePhrase: number;
        totalPhrases: number;
        bundleId: string;
        bodyClass?: string;
        isLoading?: boolean;
        errorMode?: boolean;
    }>();
</script>
