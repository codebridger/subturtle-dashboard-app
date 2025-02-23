<template>
    <div class="flex h-screen flex-col bg-gray-100">
        <Card rounded="none" class="flex w-full items-center justify-between px-3 py-3">
            <div></div>

            <div class="text-center">
                <p class="font-bold text-gray-600">{{ activePhrase }} / {{ totalPhrases }}</p>
                <h1 class="text-sm text-gray-500">{{ title }}</h1>
            </div>

            <div>
                <IconButton icon="IconX" rounded="md" color="default" size="md" :to="`/bundles/${bundleId}`" />
            </div>
        </Card>

        <section class="flex-1">
            <slot />
        </section>
    </div>
</template>
<script setup lang="ts">
    import { Card, IconButton } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    const props = defineProps<{
        title: string;
        activePhrase: number;
        totalPhrases: number;
        bundleId: string;
    }>();
</script>
