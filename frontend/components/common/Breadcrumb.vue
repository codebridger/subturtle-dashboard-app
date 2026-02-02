<template>
	<nav class="flex" aria-label="Breadcrumb">
		<ol class="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse">
			<template v-for="(item, index) in items" :key="index">
				<li class="inline-flex items-center">
					<component :is="isLast(index) ? 'span' : 'RouterLink'" :to="!isLast(index) ? item.to : undefined"
						:class="[
							'inline-flex items-center text-sm font-medium transition-colors duration-200',
							isLast(index)
								? 'text-gray-500 cursor-default dark:text-gray-400'
								: 'text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white',
						]">
						{{ item.label }}
					</component>
				</li>
				<li v-if="!isLast(index)" aria-hidden="true">
					<div class="flex items-center">
						<Icon name="icon-park-outline:right" class="mx-1 h-4 w-4 text-gray-400" />
					</div>
				</li>
			</template>
		</ol>
	</nav>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

type BreadcrumbItem = {
	label: string;
	to?: string;
};

const props = defineProps<{
	items: BreadcrumbItem[];
}>();

const isLast = (index: number) => index === props.items.length - 1;
</script>
