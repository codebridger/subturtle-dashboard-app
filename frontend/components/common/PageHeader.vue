<template>
	<div class="mb-14 flex flex-col justify-between gap-6 md:flex-row">
		<div class="flex flex-col gap-3">
			<!-- Breadcrumbs -->
			<div v-if="breadcrumbs && breadcrumbs.length" class="mb-2">
				<Breadcrumb :items="breadcrumbs" />
			</div>

			<!-- Overline Label -->
			<div v-if="overline" class="flex items-center gap-2">
				<div class="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
				<span class="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
					{{ overline }}
				</span>
			</div>

			<!-- Main Title -->
			<h1
				class="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-5xl font-black leading-none tracking-tight text-transparent dark:from-white dark:to-gray-400">
				{{ title }}
			</h1>

			<!-- Subtitle -->
			<p v-if="subtitle" class="max-w-md text-lg font-medium text-gray-500 dark:text-gray-400">
				{{ subtitle }}
			</p>
		</div>

		<!-- Right-side Actions -->
		<div v-if="$slots.actions" class="flex flex-col items-end gap-4 md:flex-row md:items-end">
			<slot name="actions" />
		</div>
	</div>
</template>

<script setup lang="ts">
import Breadcrumb from './Breadcrumb.vue';

// Define types for cleaner props
type BreadcrumbItem = {
	label: string;
	to?: string;
};

defineProps<{
	title: string;
	subtitle?: string;
	overline?: string;
	breadcrumbs?: BreadcrumbItem[];
}>();
</script>
