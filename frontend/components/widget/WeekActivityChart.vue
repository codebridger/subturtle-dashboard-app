<template>
    <div>
        <div class="flex h-[260px] items-end gap-[10px]">
            <div v-for="day in bars" :key="day.date" class="flex h-full flex-1 flex-col items-center justify-end gap-[10px]">
                <span class="text-sm font-extrabold" :class="day.peak ? 'text-st-strong' : 'text-st-faint'">
                    {{ day.value }}
                </span>
                <div class="w-full max-w-[56px] rounded-st-md" :style="{ height: day.height, background: day.fill, boxShadow: day.shadow }" />
            </div>
        </div>
        <div class="mt-[14px] flex gap-[10px]">
            <span v-for="day in bars" :key="day.date" class="flex-1 text-center text-sm font-bold text-st-faint">
                {{ day.label }}
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import type { ProgressDay } from '~/composables/useProgressSummary';

    const props = defineProps<{ days: ProgressDay[] }>();

    /**
     * The design highlights the best day of the week in the brand gradient and leaves the rest
     * flat. Bars are sized against peak * 1.12 so the tallest one never touches the ceiling.
     */
    const bars = computed(() => {
        const peak = Math.max(0, ...props.days.map((d) => d.value));
        return props.days.map((d) => {
            const isPeak = peak > 0 && d.value === peak;
            return {
                ...d,
                peak: isPeak,
                height: peak > 0 ? `${((d.value / (peak * 1.12)) * 100).toFixed(1)}%` : '0%',
                fill: isPeak ? 'linear-gradient(180deg, rgb(var(--rose-400)) 0%, rgb(var(--rose-600)) 100%)' : 'rgb(var(--ink-100))',
                shadow: isPeak ? 'var(--shadow-primary)' : 'none',
            };
        });
    });
</script>
