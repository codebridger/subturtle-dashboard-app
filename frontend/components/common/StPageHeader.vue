<template>
    <div class="flex flex-wrap items-end justify-between gap-6">
        <div>
            <div v-if="overline" class="st-overline mb-[10px]">{{ overline }}</div>
            <h1 class="font-st-display text-st-2xl font-black leading-[1.05] tracking-st-tight text-st-strong">
                {{ title }}
            </h1>
            <p v-if="subtitle" class="mt-2 max-w-[32rem] text-st-md font-semibold leading-normal text-st-muted [text-wrap:pretty]">
                {{ subtitle }}
            </p>
        </div>

        <div v-if="$slots.actions" class="flex items-center gap-3 pb-1">
            <slot name="actions" />
        </div>
    </div>
</template>

<script setup lang="ts">
    /**
     * Page header in the redesigned language: rose eyebrow, black display title, muted lead.
     * The older `PageHeader.vue` stays until the last pilotui-era screen is migrated.
     * `.st-overline` is a helper class from subturtle-ui/style.css.
     */
    defineProps<{
        title: string;
        subtitle?: string;
        overline?: string;
    }>();
</script>
