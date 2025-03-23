<template>
    <div class="h-full w-full cursor-pointer select-none" @click="flipCard">
        <Card :class="[!isFlipped ? 'bg-white' : 'bg-slate-300']" class="flex h-full items-center justify-center p-6">
            <div class="text-center text-5xl">
                <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                <span v-else>{{ props.back || 'Back' }}</span>
            </div>
        </Card>
    </div>
</template>

<script setup lang="ts">
    import { Card } from '@codebridger/lib-vue-components/elements.ts';
    const isFlipped = ref(false);

    const props = defineProps<{
        front?: string;
        back?: string;
    }>();

    function flipCard() {
        isFlipped.value = !isFlipped.value;
    }
</script>
