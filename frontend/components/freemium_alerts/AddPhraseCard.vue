<template>
    <Card
        class="border border-pink-200/50 bg-gradient-to-r from-pink-100 via-purple-50 to-blue-100 shadow-lg shadow-purple-200/30 backdrop-blur-sm transition-all duration-300 dark:border-purple-500/30 dark:from-pink-900/20 dark:via-purple-900/30 dark:to-blue-900/20 dark:shadow-purple-800/20"
    >
        <div class="flex items-center gap-4">
            <!-- Limitation Info Section -->
            <div class="flex flex-1 items-center gap-3">
                <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-purple-300 shadow-inner dark:from-pink-800 dark:to-purple-700"
                >
                    <Icon name="IconLockDots" class="h-4 w-4 text-purple-700 dark:text-purple-200" />
                </div>
                <div class="flex-1">
                    <div
                        class="bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-sm font-semibold text-transparent dark:from-purple-300 dark:to-blue-300"
                    >
                        {{ freemiumAllocation?.allowed_save_words_used || 0 }}/{{ freemiumAllocation?.allowed_save_words || 50 }} Words
                    </div>
                    <div class="text-xs text-purple-600 dark:text-purple-300">Free spots left to save phrases</div>
                </div>
                <div class="flex items-center gap-2">
                    <!-- Compact Progress Bar -->
                    <div class="h-2 w-12 rounded-full bg-purple-200/60 shadow-inner dark:bg-purple-800/60">
                        <div
                            class="h-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 shadow-sm transition-all duration-500 ease-out"
                            :style="{
                                width: `${((freemiumAllocation?.allowed_save_words_used || 1) / (freemiumAllocation?.allowed_save_words || 50)) * 100}%`,
                            }"
                        ></div>
                    </div>
                </div>
            </div>

            <!-- Divider -->
            <div class="h-8 w-px bg-purple-200 dark:bg-purple-700"></div>

            <!-- Context-Aware Button Section -->
            <div class="flex items-center">
                <Button
                    color="primary"
                    size="md"
                    @click="handleAddPhrase"
                    :iconName="isAtLimit ? 'IconCrown' : 'IconPlus'"
                    :label="isAtLimit ? 'Upgrade Now' : 'Add Phrase'"
                    class="border-none bg-gradient-to-r from-pink-500 to-purple-600 shadow-md transition-all duration-300 hover:from-pink-600 hover:to-purple-700 hover:shadow-lg"
                />
            </div>
        </div>
    </Card>
</template>

<script setup lang="ts">
    import { Button, Card, Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { useProfileStore } from '~/stores/profile';

    const profileStore = useProfileStore();

    const freemiumAllocation = computed(() => profileStore.freemiumAllocation);

    const isAtLimit = computed(() => {
        if (!profileStore.isFreemium) return false;
        const used = freemiumAllocation.value?.allowed_save_words_used || 0;
        const total = freemiumAllocation.value?.allowed_save_words || 0;
        return used >= total;
    });

    // Events
    const emit = defineEmits<{
        addPhrase: [];
        upgrade: [];
    }>();

    function handleAddPhrase() {
        if (isAtLimit.value) {
            emit('upgrade');
        } else {
            emit('addPhrase');
        }
    }
</script>
