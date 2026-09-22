<template>
    <div ref="wrapper" class="relative h-full w-full">
        <iframe ref="container" :key="renderKey" :class="[...props.classes, 'bg-transparent']" :src="getUrl()" />
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

    const wrapper = ref<HTMLElement | null>(null);
    // The word cloud sizes its canvas from window.innerWidth/Height once, at load. Bumping this
    // key remounts the iframe so it re-measures; without it a cover laid out after load (grid
    // reflow, sidebar collapse) paints a canvas narrower than its frame and leaves a bare strip.
    const renderKey = ref(0);
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    let lastWidth = 0;

    onMounted(() => {
        if (!wrapper.value || typeof ResizeObserver === 'undefined') return;

        observer = new ResizeObserver(([entry]) => {
            const width = Math.round(entry.contentRect.width);
            if (width === 0 || width === lastWidth) return;
            lastWidth = width;

            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => renderKey.value++, 150);
        });
        observer.observe(wrapper.value);
    });

    onBeforeUnmount(() => {
        clearTimeout(resizeTimer);
        observer?.disconnect();
    });

    function getUrl() {
        return '/wordcloud/index.html?words=' + encodeURIComponent(JSON.stringify(props.words));
    }

    function emitClick(event: MouseEvent) {
        emit('click', event);
    }
</script>
