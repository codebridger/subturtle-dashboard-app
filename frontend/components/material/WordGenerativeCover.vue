<template>
    <div class="relative">
        <iframe ref="container" :class="[...props.classes, 'bg-blue-400']" :src="getUrl()" />
        <!-- Transparent overlay to handle clicks properly -->
        <div class="absolute inset-0 z-10 cursor-pointer" @click="emitClick" />
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{
        words: string[];
        classes: string[];
    }>();

    const emit = defineEmits(['click']);

    function getUrl() {
        return '/wordcloud/index.html?words=' + encodeURIComponent(JSON.stringify(props.words));
    }

    function emitClick(event: MouseEvent) {
        emit('click', event);
    }
</script>
