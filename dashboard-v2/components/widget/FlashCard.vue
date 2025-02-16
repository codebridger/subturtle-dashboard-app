<template>
    <Card
        class="flex h-full w-full cursor-pointer select-none items-center justify-center rounded-lg p-6 shadow-sm"
        :color="!isFlipped ? 'default' : 'info'"
        @click="flipCard"
    >
        <div class="text-5xl">
            <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
            <span v-else>{{ props.back || 'Back' }}</span>
        </div>
    </Card>
</template>

<script setup lang="ts">
    import { Card } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    const isFlipped = ref(false);

    const props = defineProps<{
        front?: string;
        back?: string;
    }>();

    function flipCard() {
        isFlipped.value = !isFlipped.value;
    }
</script>
