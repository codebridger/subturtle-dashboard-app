<template>
    <section v-if="isVisible" class="w-full px-4 py-2">
        <Card
            class="border border-pink-200/50 bg-gradient-to-r from-pink-100 via-purple-50 to-blue-100 shadow-none backdrop-blur-sm transition-all duration-300 dark:border-purple-500/30 dark:from-pink-900/20 dark:via-purple-900/30 dark:to-blue-900/20"
        >
            <div class="flex items-center justify-center gap-4 py-2">
                <div class="flex items-center gap-3">
                    <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-purple-300 shadow-inner dark:from-pink-800 dark:to-purple-700"
                    >
                        <Icon name="IconClock" class="h-4 w-4 text-purple-700 dark:text-purple-200" />
                    </div>
                    <div class="flex items-center gap-4">
                        <div>
                            <div
                                class="bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-sm font-semibold text-transparent dark:from-purple-300 dark:to-blue-300"
                            >
                                {{ formatTime(timeRemaining) }}
                            </div>
                            <div class="text-xs text-purple-600 dark:text-purple-300">{{ label }}</div>
                        </div>
                        <!-- Progress Ring -->
                        <div class="relative flex h-12 w-12 items-center justify-center">
                            <svg class="h-12 w-12 -rotate-90 transform" viewBox="0 0 36 36">
                                <path
                                    class="text-purple-200 dark:text-purple-800"
                                    d="M18 2.0845
                                        a 15.9155 15.9155 0 0 1 0 31.831
                                        a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                ></path>
                                <path
                                    class="text-gradient-to-r from-pink-500 via-purple-500 to-blue-500"
                                    :class="timeRemaining <= 60 ? 'text-red-500' : 'text-purple-500'"
                                    d="M18 2.0845
                                        a 15.9155 15.9155 0 0 1 0 31.831
                                        a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    :stroke-dasharray="`${timerProgress}, 100`"
                                ></path>
                            </svg>
                            <div class="absolute inset-0 flex items-center justify-center">
                                <span class="text-xs font-bold text-purple-700 dark:text-purple-200"> {{ Math.ceil(timeRemaining / 60) }}m </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    </section>
</template>

<script setup lang="ts">
    import { Card, Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { useLiveSessionStore } from '~/stores/liveSession';

    const props = withDefaults(
        defineProps<{
            // Timer configuration
            duration?: number; // Duration in seconds
            label?: string; // Label text below timer
            isVisible?: boolean; // Whether to show the timer
            autoStart?: boolean; // Whether to start timer automatically
            autoMuteMic?: boolean; // Whether to auto-mute mic on expiration
            showWarningAt?: number; // Show warning when X seconds remaining
        }>(),
        {
            duration: 5 * 60, // 5 minutes default for freemium
            label: 'Free session time remaining',
            isVisible: true,
            autoStart: true,
            autoMuteMic: true,
            showWarningAt: 60, // 1 minute warning
        }
    );

    const emit = defineEmits<{
        expired: [];
        tick: [timeRemaining: number];
        warning: [timeRemaining: number];
        started: [];
        stopped: [];
    }>();

    // Timer state
    const timeRemaining = ref(props.duration);
    const timerInterval = ref<NodeJS.Timeout | null>(null);
    const isRunning = ref(false);
    const warningShown = ref(false);

    // Computed values
    const timerProgress = computed(() => {
        const progress = (timeRemaining.value / props.duration) * 100;
        return Math.max(0, Math.min(100, progress));
    });

    // Lifecycle
    onMounted(() => {
        if (props.autoStart) {
            startTimer();
        }
    });

    onBeforeUnmount(() => {
        stopTimer();
    });

    // Watch for duration changes (if timer needs to be reset with new duration)
    watch(
        () => props.duration,
        (newDuration) => {
            if (!isRunning.value) {
                timeRemaining.value = newDuration;
                warningShown.value = false;
            }
        }
    );

    // Timer functions
    function startTimer() {
        if (timerInterval.value || isRunning.value) return;

        isRunning.value = true;
        emit('started');

        timerInterval.value = setInterval(() => {
            timeRemaining.value--;
            emit('tick', timeRemaining.value);

            // Check for warning
            if (props.showWarningAt && timeRemaining.value === props.showWarningAt && !warningShown.value) {
                warningShown.value = true;
                emit('warning', timeRemaining.value);
            }

            if (timeRemaining.value <= 0) {
                stopTimer();
                handleTimerExpired();
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval.value) {
            clearInterval(timerInterval.value);
            timerInterval.value = null;
        }

        if (isRunning.value) {
            isRunning.value = false;
            emit('stopped');
        }
    }

    function resetTimer(newDuration?: number) {
        stopTimer();
        timeRemaining.value = newDuration || props.duration;
        warningShown.value = false;
    }

    function pauseTimer() {
        if (timerInterval.value) {
            clearInterval(timerInterval.value);
            timerInterval.value = null;
            isRunning.value = false;
        }
    }

    function resumeTimer() {
        if (!isRunning.value && timeRemaining.value > 0) {
            startTimer();
        }
    }

    function handleTimerExpired() {
        // Auto-mute mic if enabled
        if (props.autoMuteMic) {
            try {
                // Try to access live session store
                const liveSessionStore = useLiveSessionStore();
                if (liveSessionStore.getMicrophoneMuted === false) {
                    liveSessionStore.toggleMicrophone();
                }
            } catch (error) {
                console.warn('Could not auto-mute microphone:', error);
            }
        }

        emit('expired');
    }

    // Helper functions
    function formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Expose methods for parent component
    defineExpose({
        startTimer,
        stopTimer,
        resetTimer,
        pauseTimer,
        resumeTimer,
        timeRemaining: readonly(timeRemaining),
        isRunning: readonly(isRunning),
    });
</script>
