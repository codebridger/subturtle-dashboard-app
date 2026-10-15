<template>
    <TransitionGroup name="fade" tag="div">
        <div v-if="isLoading" class="flex h-[60vh] flex-col items-center justify-center">
            <div class="flex h-full w-full items-center justify-center">
                <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-gray-900"></div>
            </div>
        </div>

        <div v-else-if="errorMode && !isLoading" class="flex h-[60vh] flex-col items-center justify-center">
            <slot name="error-mode" />
        </div>

        <!-- These screens render inside the app shell (D-04), so the session fills the shell's
             content column: the viewport less the 68px topbar and the column's own padding. -->
        <div class="flex h-[calc(100dvh-68px-5.5rem)] min-h-[480px] flex-col overflow-hidden rounded-st-lg" v-else-if="!errorMode && !isLoading">
            <Card rounded="none" :class="['flex w-full items-center justify-between px-3 py-0 md:!py-3']">
                <div></div>

                <div :class="['text-center font-bold', 'flex flex-row-reverse gap-2 md:!block']">
                    <p class="text-gray-500">{{ activePhrase }} / {{ totalPhrases }}</p>
                    <h1 class="text-sm text-gray-800">{{ title }}</h1>
                </div>

                <!-- The shell's topbar carries the theme switch and the language menu now. -->
                <div class="flex items-center gap-[10px]">
                    <Button class="scale-50 md:scale-100" rounded="md" size="md" iconName="IconX" @click="endSession" />
                </div>
            </Card>

            <section :class="['flex-1', bodyClass]">
                <slot />
            </section>
        </div>
    </TransitionGroup>
</template>

<script setup lang="ts">
import { Card, Button } from 'pilotui/elements';

const props = defineProps<{
    title: string;
    activePhrase: number;
    totalPhrases: number;
    bundleId: string;
    bodyClass?: string;
    isLoading?: boolean;
    errorMode?: boolean;
}>();

const emit = defineEmits<{
    'end-session': [];
}>();

function endSession() {
    emit('end-session');
}
</script>
