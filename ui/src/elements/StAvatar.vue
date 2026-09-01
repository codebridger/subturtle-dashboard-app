<template>
    <span class="st-relative st-inline-flex st-shrink-0" :style="{ width: `${dim}px`, height: `${dim}px` }">
        <span
            class="st-flex st-items-center st-justify-center st-overflow-hidden st-rounded-circle st-font-sans st-font-extrabold st-text-rose-700 st-border-[1.5px] st-border-card st-shadow-xs"
            :class="src ? 'st-bg-ink-100' : 'st-bg-primary-soft'"
            :style="{ width: `${dim}px`, height: `${dim}px`, fontSize: `${dim * 0.38}px` }"
        >
            <img v-if="src" :src="src" :alt="name" class="st-w-full st-h-full st-object-cover" />
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
    import { computed } from 'vue';

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
