<template>
    <div v-if="loading" class="flex h-64 items-center justify-center">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
    </div>
    <div v-else class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800">
        <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">{{ $t('smart_review.progress') }}</h3>

        <div v-if="!leitnerStore.stats || leitnerStore.stats.totalItems === 0"
            class="flex h-40 flex-col items-center justify-center text-gray-500">
            <p>No phrases in the system yet.</p>
        </div>

        <client-only v-else>
            <apexchart type="bar" height="300" :options="chartOptions" :series="series"></apexchart>
        </client-only>
    </div>
</template>

<script setup lang="ts">
import { useLeitnerStore } from '~/stores/leitner';



// Use standard ApexCharts via plugin global component usually
// or import defineAsyncComponent if needed. 
// Assuming 'apexchart' is globally registered or handled by nuxt plugin.

const leitnerStore = useLeitnerStore();
const { t } = useI18n();
// const { stats } = storeToRefs(leitnerStore); // Old syntax removed
const loading = ref(true);

const series = computed(() => {
    if (!leitnerStore.stats || !leitnerStore.stats.distribution) return [{ name: 'Phrases', data: [] }];

    // Convert distribution object to array
    // Box 1, Box 2, ...
    const data = [];
    const totalBoxes = leitnerStore.stats.settings?.totalBoxes || 5;

    for (let i = 1; i <= totalBoxes; i++) {
        data.push(leitnerStore.stats.distribution[i] || 0);
    }

    return [{
        name: 'Phrases',
        data: data
    }];
});

const chartOptions = computed(() => {
    return {
        chart: {
            type: 'bar',
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                borderRadius: 4,
                horizontal: false,
                distributed: true // colorful bars
            }
        },
        dataLabels: {
            enabled: false
        },
        xaxis: {
            categories: Array.from({ length: leitnerStore.stats?.settings?.totalBoxes || 5 }, (_, i) => t('smart_review.level_number', { number: i + 1 })),
            title: { text: t('smart_review.levels') }
        },
        yaxis: {
            title: { text: 'Phrases' }
        },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'],
        theme: {
            mode: isDark.value ? 'dark' : 'light' // dynamic theme
        }
    };
});

// Detect dark mode helper (naive)
const isDark = computed(() => {
    // Just a placeholder, assume light or detect via DOM/Store
    return false;
});

onMounted(async () => {
    loading.value = true;
    await leitnerStore.fetchStats();
    loading.value = false;
});
</script>
