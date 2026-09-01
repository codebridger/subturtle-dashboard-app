<template>
    <span class="st-relative st-inline-flex st-shrink-0" :style="{ width: `${dim}px`, height: `${dim}px` }">
        <span
            class="st-flex st-items-center st-justify-center st-overflow-hidden st-rounded-circle st-font-sans st-font-extrabold st-text-rose-700 st-border-[1.5px] st-border-card st-shadow-xs"
            :class="showImage ? 'st-bg-ink-100' : 'st-bg-primary-soft'"
            :style="{ width: `${dim}px`, height: `${dim}px`, fontSize: `${dim * 0.38}px` }"
        >
            <img v-if="showImage" :src="src" :alt="name" class="st-w-full st-h-full st-object-cover" @error="broken = true" />
            <template v-else>{{ initials }}</template>
        </span>
        <span
            v-if="online"
            class="st-absolute st-right-0 st-bottom-0 st-rounded-circle st-bg-accent st-border-2 st-border-card"
            :style="{ width: `${dim * 0.28}px`, height: `${dim * 0.28}px` }"
        />
    </span>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue';

    const props = withDefaults(
        defineProps<{
            /** Used for the initials fallback and as the image's alt text. */
            name?: string;
            src?: string;
            size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
            /** Shows the jade presence dot. */
            online?: boolean;
        }>(),
        { name: '', size: 'md' }
    );

    const dim = computed(() => ({ xs: 28, sm: 36, md: 44, lg: 56, xl: 72 })[props.size]);

    /**
     * A `src` that fails to load falls back to the initials rather than leaving a broken image.
     * This is the only place that can tell a genuinely dead avatar URL from one a caller merely
     * could not pre-cache, so callers should pass the URL and let this decide. Reset when `src`
     * changes, so a later working URL is not suppressed by an earlier failure.
     */
    const broken = ref(false);
    watch(
        () => props.src,
        () => (broken.value = false)
    );
    const showImage = computed(() => !!props.src && !broken.value);

    /** First letter of each of the first two words: "Somi Park" -> "SP". */
    const initials = computed(() =>
        props.name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase()
    );
</script>
