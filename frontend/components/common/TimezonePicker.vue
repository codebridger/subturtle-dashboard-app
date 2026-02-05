<template>
    <Modal :title="t('profile.select_timezone')" size="md" :disabled="disabled">
        <template #trigger="{ toggleModal }">
            <div @click="scrollToSelected(); toggleModal(true)"
                :class="['w-full cursor-pointer rounded-xl border bg-white px-4 py-3 text-sm font-medium transition-all duration-300 focus:border-primary focus:ring-4 focus:ring-primary/10 dark:bg-gray-800 dark:text-gray-300', disabled ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 hover:shadow-md dark:hover:border-gray-600']">
                <div class="flex items-center justify-between">
                    <span v-if="modelValue" class="truncate text-gray-900 dark:text-white">{{ modelValue }}</span>
                    <span v-else class="text-gray-400">{{ t('profile.select_timezone') }}</span>
                    <Icon name="iconify solar--alt-arrow-down-bold-duotone"
                        class="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
                </div>
            </div>
        </template>

        <template #default>
            <div class="flex flex-col h-[60vh] md:h-[500px]">
                <div class="p-4 border-b border-gray-100 dark:border-gray-700">
                    <Input v-model="searchQuery" :placeholder="t('search')" icon="iconify solar--magnifer-linear"
                        class="w-full" autofocus />
                </div>

                <div v-if="tempSelectedTimezone && !searchQuery"
                    class="sticky top-0 z-10 border-b border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:border-gray-700 dark:bg-gray-800/80">
                    <p class="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        {{ t('profile.current_timezone') }}
                    </p>
                    <div class="flex items-center gap-2.5 text-base font-bold text-gray-900 dark:text-white">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
                            <Icon name="iconify solar--clock-circle-bold-duotone" class="h-4 w-4" />
                        </div>
                        {{ tempSelectedTimezone }}
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-2 scrollbar-custom" ref="listRef">
                    <div v-if="filteredTimezones.length === 0"
                        class="flex flex-col items-center justify-center py-12 text-gray-500">
                        <Icon name="iconify solar--magnifer-linear" class="h-12 w-12 mb-2 opacity-20" />
                        <p>{{ t('no_results_found') }}</p>
                    </div>

                    <ul v-else class="space-y-1">
                        <li v-for="tz in filteredTimezones" :key="tz" :data-tz="tz">
                            <button type="button" @click="selectTimezone(tz)"
                                class="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-between group"
                                :class="[
                                    tempSelectedTimezone === tz
                                        ? 'bg-gradient-to-r from-primary/10 to-transparent text-primary font-bold shadow-sm ring-1 ring-primary/20 translate-x-1'
                                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:translate-x-1 hover:text-gray-900 dark:hover:text-white'
                                ]">
                                {{ tz }}
                                <Icon v-if="tempSelectedTimezone === tz" name="iconify solar--check-circle-bold"
                                    class="h-5 w-5 text-primary drop-shadow-sm" />
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </template>

        <template #footer="{ toggleModal }">
            <div class="flex justify-end gap-3 p-4 border-t border-gray-100 dark:border-gray-700">
                <Button shadow outline @click="toggleModal(false)">
                    {{ t('cancel') }}
                </Button>
                <Button shadow color="primary" @click="confirmSelection(toggleModal)" :disabled="!tempSelectedTimezone">
                    {{ t('confirm') }}
                </Button>
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { Modal } from '@codebridger/lib-vue-components/complex.ts';
import { Input, Button, Icon } from '@codebridger/lib-vue-components/elements.ts';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
    modelValue?: string;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const { t } = useI18n();
const isOpen = ref(false);
const searchQuery = ref('');
const listRef = ref<HTMLElement | null>(null);
const tempSelectedTimezone = ref('');

const availableTimeZones = Intl.supportedValuesOf('timeZone');

const filteredTimezones = computed(() => {
    if (!searchQuery.value) return availableTimeZones;
    const query = searchQuery.value.toLowerCase();
    return availableTimeZones.filter(tz => tz.toLowerCase().includes(query));
});

function selectTimezone(tz: string) {
    tempSelectedTimezone.value = tz;
}

function confirmSelection(toggleModal: (state: boolean) => void) {
    if (tempSelectedTimezone.value) {
        emit('update:modelValue', tempSelectedTimezone.value);
        toggleModal(false);
        searchQuery.value = '';
    }
}

function scrollToSelected() {
    tempSelectedTimezone.value = props.modelValue || '';

    nextTick(() => {
        if (tempSelectedTimezone.value) {
            // Poll for the element to exist
            const poll = setInterval(() => {
                const container = listRef.value;
                if (container && container.children.length > 0) {
                    // Use explicit attribute selector with CSS.escape for safety
                    const escapedValue = CSS.escape(tempSelectedTimezone.value || '');
                    const selectedEl = container.querySelector(`[data-tz="${escapedValue}"]`);

                    if (selectedEl) {
                        // Use scrollIntoView to scroll the element itself
                        selectedEl.scrollIntoView({ block: 'center' });

                        clearInterval(poll);
                    }
                }
            }, 100);

            // Safety timeout to clear interval
            setTimeout(() => clearInterval(poll), 2000);
        }
    });
}
</script>

<style scoped>
.scrollbar-custom::-webkit-scrollbar {
    width: 6px;
}

.scrollbar-custom::-webkit-scrollbar-track {
    background: transparent;
}

.scrollbar-custom::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
}

.dark .scrollbar-custom::-webkit-scrollbar-thumb {
    background: #334155;
}

.scrollbar-custom::-webkit-scrollbar-thumb:hover {
    background: #cbd5e1;
}

.dark .scrollbar-custom::-webkit-scrollbar-thumb:hover {
    background: #475569;
}
</style>
