<template>
    <nav class="flex items-center justify-center gap-2" :aria-label="label">
        <StButton variant="outline" color="neutral" size="sm" icon="solar:alt-arrow-left-linear" :disabled="modelValue <= 1" @click="go(modelValue - 1)">
            {{ t('pagination.prev') }}
        </StButton>

        <span class="px-2 text-st-sm font-bold text-st-muted">{{ t('pagination.page-of', { page: modelValue, total: totalPages }) }}</span>

        <StButton
            variant="outline"
            color="neutral"
            size="sm"
            icon-right="solar:alt-arrow-right-linear"
            :disabled="modelValue >= totalPages"
            @click="go(modelValue + 1)"
        >
            {{ t('pagination.next') }}
        </StButton>
    </nav>
</template>

<script setup lang="ts">
    /**
     * Prev / "Page 1 of 3" / Next, replacing pilotui's `Pagination` on migrated screens.
     *
     * App-local rather than in subturtle-ui: the design system defines no pagination
     * component at all, so this is our composition of its tokens, not a library primitive.
     * The second migrated screen that needs one is the moment to graduate it — the same call
     * `InlineNotice` records.
     *
     * Emits `change-page` alongside `update:modelValue` so a caller can refetch; that matches
     * the pilotui component it replaces, so call sites need no rewiring.
     */
    import { StButton } from 'subturtle-ui';

    const props = withDefaults(
        defineProps<{
            modelValue?: number;
            totalPages?: number;
            /** Accessible name, when a page has more than one pager. */
            label?: string;
        }>(),
        { modelValue: 1, totalPages: 1 }
    );

    const emit = defineEmits<{ 'update:modelValue': [number]; 'change-page': [number] }>();

    const { t } = useI18n();

    function go(page: number) {
        if (page < 1 || page > props.totalPages || page === props.modelValue) return;
        emit('update:modelValue', page);
        emit('change-page', page);
    }
</script>
