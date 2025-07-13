<template>
    <Card
        class="border border-pink-200/50 bg-gradient-to-r from-pink-100 via-purple-50 to-blue-100 shadow-none backdrop-blur-sm transition-all duration-300 dark:border-purple-500/30 dark:from-pink-900/20 dark:via-purple-900/30 dark:to-blue-900/20"
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
                        {{ usedCount }}/{{ totalCount }} {{ unitLabel }}
                    </div>
                    <div class="text-xs text-purple-600 dark:text-purple-300">{{ description }}</div>
                </div>
                <div class="flex items-center gap-2">
                    <!-- Compact Progress Bar -->
                    <div class="h-2 w-12 rounded-full bg-purple-200/60 shadow-inner dark:bg-purple-800/60">
                        <div
                            class="h-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 shadow-sm transition-all duration-500 ease-out"
                            :style="{ width: `${progressPercentage}%` }"
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
                    @click="handleAction"
                    :iconName="isAtLimit ? 'IconCrown' : actionIcon"
                    :label="isAtLimit ? t('freemium.limitation.upgrade_now') : actionLabel"
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
    const { t } = useI18n();

    const props = defineProps<{
        type: 'phrase' | 'liveSession';
        actionLabel?: string;
        actionIcon?: string;
    }>();

    const freemiumAllocation = computed(() => profileStore.freemiumAllocation);

    // Dynamic configuration based on type
    const config = computed(() => {
        if (props.type === 'phrase') {
            return {
                unitLabel: 'Words',
                description: t('freemium.limitation.free_spots_left'),
                usedField: 'allowed_save_words_used',
                totalField: 'allowed_save_words',
                actionLabel: props.actionLabel || t('bundle.add_phrase'),
                actionIcon: props.actionIcon || 'IconPlus',
            };
        } else {
            return {
                unitLabel: 'Sessions',
                description: t('freemium.limitation.free_sessions_left'),
                usedField: 'allowed_lived_sessions_used',
                totalField: 'allowed_lived_sessions',
                actionLabel: props.actionLabel || t('live-practice.start'),
                actionIcon: props.actionIcon || 'IconPlay',
            };
        }
    });
    const unitLabel = computed(() => config.value.unitLabel);
    const description = computed(() => config.value.description);
    const actionLabel = computed(() => config.value.actionLabel);
    const actionIcon = computed(() => config.value.actionIcon);

    const usedCount = computed(() => {
        return (freemiumAllocation.value as any)?.[config.value.usedField];
    });

    const totalCount = computed(() => {
        return (freemiumAllocation.value as any)?.[config.value.totalField];
    });

    const progressPercentage = computed(() => {
        const used = usedCount.value;
        const total = totalCount.value;
        return Math.min((used / total) * 100, 100);
    });

    const isAtLimit = computed(() => {
        if (!profileStore.isFreemium) return false;
        return usedCount.value >= totalCount.value;
    });

    // Events
    const emit = defineEmits<{
        action: [];
        'upgrade-needed': [];
    }>();

    function handleAction() {
        if (isAtLimit.value) {
            emit('upgrade-needed');
        } else {
            emit('action');
        }
    }
</script>
