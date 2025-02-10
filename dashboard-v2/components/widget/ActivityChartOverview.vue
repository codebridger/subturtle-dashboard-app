<template>
    <Card class="p-6">
        <div class="flex justify-between">
            <h1>{{ props.title }}</h1>
        </div>
        <MaterialAddonApexcharts type="area" :height="400" :options="chartOption" :series="series" />
    </Card>
</template>

<script setup lang="ts">
    import { functionProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';
    import { Card } from '@tiny-ideas-ir/lib-vue-components/elements.ts';

    const props = defineProps<{
        title: string;
    }>();

    const series = ref([
        { name: 'Phrases', data: <[Date, number][]>[] },
        { name: 'Bundles', data: <[Date, number][]>[] },
    ]);

    const primary = '#3498db'; // example color
    const info = '#1abc9c'; // example color
    const success = '#2ecc71'; // example color

    const chartOption = ref({
        xaxis: {
            type: 'datetime',
        },
        yaxis: {
            type: 'numeric',
        },
        chart: {
            stacked: false,
            zoom: {
                enabled: false,
            },
            toolbar: {
                show: false,
            },
        },
        grid: {
            show: false,
        },
        dataLabels: {
            enabled: false,
        },
        markers: {
            size: 0,
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                inverseColors: false,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [20, 100, 100, 100],
            },
        },
        colors: [primary, info, success],
        title: {
            text: '',
            align: 'left',
        },
        tooltip: {
            shared: true,
        },
        stroke: {
            width: [2, 2, 2],
        },
        legend: {
            show: false,
            position: 'top',
            horizontalAlign: 'center',
        },
    });

    onMounted(() => {
        prepareData();
    });

    function getSeries(collection: string) {
        return functionProvider.run<[Date, number][]>({
            name: 'generateChartDataForInsertionRatio',
            args: {
                database: DATABASE.USER_CONTENT,
                collection: collection,
                userId: authUser.value?.id,
                days: 7,
            },
        });
    }

    function prepareData() {
        Promise.all([getSeries(COLLECTIONS.PHRASE), getSeries(COLLECTIONS.PHRASE_BUNDLE)]).then(([phrase, bundle]) => {
            series.value[0].data = phrase;
            series.value[1].data = bundle;
        });
    }
</script>
