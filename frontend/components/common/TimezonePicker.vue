<template>
    <div>
        <!-- Trigger. The design draws this as a field rather than a button, so it lines up with the
             StInputs beside it in the grid: same 40px control height, same radius, same border. -->
        <button
            type="button"
            :disabled="disabled"
            class="st-focus-ring flex h-10 w-full items-center justify-between gap-[10px] rounded-st-md border-[1.5px] border-st-line bg-st-card px-[14px] text-st-sm font-bold text-st-strong transition-colors duration-200 hover:border-st-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-st-line"
            @click="openPicker"
        >
            <span class="truncate">{{ modelValue || t('profile.select_timezone') }}</span>
            <StIcon name="solar:alt-arrow-down-bold-duotone" :size="17" class="flex-none text-st-faint" />
        </button>

        <StModal :open="isOpen" size="md" :title="t('profile.select_timezone')" :description="t('profile.tz_description')" @close="closePicker">
            <StInput v-model="searchQuery" :placeholder="t('profile.tz_search')" icon="solar:magnifer-linear" autofocus />

            <!-- Fixed max height so the modal never grows past the viewport on the ~450-zone list. -->
            <div ref="listRef" class="mt-[14px] flex max-h-[300px] flex-col gap-[2px] overflow-y-auto">
                <button
                    v-for="tz in filteredTimezones"
                    :key="tz"
                    :data-tz="tz"
                    type="button"
                    class="st-focus-ring flex items-center justify-between gap-3 rounded-st-md px-[13px] py-[11px] text-left text-st-sm font-bold transition-colors duration-200"
                    :class="tempSelectedTimezone === tz ? 'bg-st-primary-soft text-st-rose-700' : 'text-st-body hover:bg-st-sunken'"
                    @click="selectTimezone(tz)"
                >
                    {{ tz }}
                    <StIcon v-if="tempSelectedTimezone === tz" name="solar:check-circle-bold" :size="18" class="flex-none" />
                </button>

                <div v-if="filteredTimezones.length === 0" class="px-3 py-9 text-center text-st-sm font-bold text-st-faint">
                    {{ t('profile.tz_no_match') }}
                </div>
            </div>

            <template #actions>
                <StButton variant="ghost" color="neutral" @click="closePicker">{{ t('cancel') }}</StButton>
                <StButton color="primary" :disabled="!tempSelectedTimezone" @click="confirmSelection">{{ t('confirm') }}</StButton>
            </template>
        </StModal>
    </div>
</template>

<script setup lang="ts">
    import { ref, computed, nextTick } from 'vue';
    import { StButton, StIcon, StInput, StModal } from 'subturtle-ui';
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
        return availableTimeZones.filter((tz) => tz.toLowerCase().includes(query));
    });

    function openPicker() {
        if (props.disabled) return;
        searchQuery.value = '';
        tempSelectedTimezone.value = props.modelValue || '';
        isOpen.value = true;
        scrollToSelected();
    }

    function closePicker() {
        isOpen.value = false;
        searchQuery.value = '';
    }

    function selectTimezone(tz: string) {
        tempSelectedTimezone.value = tz;
    }

    function confirmSelection() {
        if (!tempSelectedTimezone.value) return;
        emit('update:modelValue', tempSelectedTimezone.value);
        closePicker();
    }

    // The list only exists once StModal has teleported and rendered, and the selected row can sit
    // hundreds of entries down — poll briefly for it rather than assuming one nextTick is enough.
    function scrollToSelected() {
        if (!tempSelectedTimezone.value) return;

        nextTick(() => {
            const poll = setInterval(() => {
                const container = listRef.value;
                if (!container || container.children.length === 0) return;

                const selectedEl = container.querySelector(`[data-tz="${CSS.escape(tempSelectedTimezone.value)}"]`);
                if (selectedEl) {
                    selectedEl.scrollIntoView({ block: 'center' });
                    clearInterval(poll);
                }
            }, 100);

            // Safety timeout so a never-rendered row can't leave the interval running.
            setTimeout(() => clearInterval(poll), 2000);
        });
    }
</script>
