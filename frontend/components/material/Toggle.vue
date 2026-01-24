<template>
	<div class="flex items-center gap-2">
		<span v-if="label" class="text-xs font-semibold text-gray-500 whitespace-nowrap">{{ label }}</span>
		<label class="relative inline-flex cursor-pointer items-center">
			<input type="checkbox" :checked="modelValue"
				@change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
				class="peer sr-only" />
			<div :class="[
				'h-5 w-9 rounded-full transition-all after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[\'\'] peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-gray-700',
				modelValue ? 'bg-primary' : 'bg-gray-200'
			]">
			</div>
		</label>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	modelValue: boolean;
	label?: string;
}>();

defineEmits(['update:modelValue']);
</script>
