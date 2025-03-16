<template>
    <div class="toggle-container">
        <div class="toggle-switch" :class="{ 'right-active': !isToggleMode }">
            <!-- Left side (Toggle Mute/Unmute) -->
            <div class="toggle-side left" :class="{ active: isToggleMode }" @click="handleLeftClick">
                <template v-if="isToggleMode">
                    <Icon
                        :name="isMuted ? 'iconify clarity--microphone-mute-line' : 'iconify solar--microphone-line-duotone'"
                        class="mic-icon"
                        :class="{ muted: isMuted, unmuted: !isMuted }"
                    />
                </template>
                <span v-else class="side-text">Toggle Mode</span>
            </div>

            <!-- Right side (Always Unmute) -->
            <div class="toggle-side right" :class="{ active: !isToggleMode }" @click="handleRightClick">
                <template v-if="!isToggleMode">
                    <Icon name="iconify solar--microphone-line-duotone" class="mic-icon unmuted" />
                </template>
                <span v-else class="side-text">Always On</span>
            </div>

            <!-- Sliding indicator -->
            <div class="slider" :class="{ right: !isToggleMode }"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { ref, computed, watch } from 'vue';
    import { useLiveSessionStore } from '~/stores/liveSession';

    const liveSessionStore = useLiveSessionStore();

    // State
    const isToggleMode = ref(true); // true for left side (toggle mute), false for right side (always unmute)

    // Computed
    const isMuted = computed(() => liveSessionStore.getMicrophoneMuted);

    // Methods
    function switchToToggleMode() {
        if (!isToggleMode.value) {
            isToggleMode.value = true;
            // Always start in muted state when switching to toggle mode
            if (!isMuted.value) {
                liveSessionStore.toggleMicrophone();
            }
        }
    }

    function switchToAlwaysOn() {
        if (isToggleMode.value) {
            isToggleMode.value = false;
            if (isMuted.value) {
                liveSessionStore.toggleMicrophone(); // Ensure unmuted in always-on mode
            }
        }
    }

    function handleLeftClick() {
        if (isToggleMode.value) {
            // In toggle mode, handle mute/unmute
            liveSessionStore.toggleMicrophone();
        } else {
            // Switch to toggle mode
            switchToToggleMode();
        }
    }

    function handleRightClick() {
        if (!isToggleMode.value) {
            // Already in always-on mode, do nothing
            return;
        } else {
            // Switch to always-on mode
            switchToAlwaysOn();
        }
    }

    // Watch for mode changes to ensure proper state
    watch(isToggleMode, (newValue) => {
        if (!newValue && isMuted.value) {
            // If switched to always-on mode and muted, unmute
            liveSessionStore.toggleMicrophone();
        }
    });

    watch(
        () => liveSessionStore.getMicrophoneMuted,
        (newValue) => {
            if (newValue == false) {
                isToggleMode.value = true;
            }
        },
        // it should be only once
        { immediate: true, deep: true, once: true }
    );
</script>

<style scoped>
    .toggle-container {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .toggle-switch {
        position: relative;
        width: 320px;
        height: 48px;
        background: #f5f5f5;
        border-radius: 24px;
        display: flex;
        cursor: pointer;
        overflow: hidden;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .toggle-side {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        transition: all 0.3s ease;
        padding: 0 12px;
    }

    .slider {
        position: absolute;
        width: 50%;
        height: 100%;
        background: white;
        border-radius: 24px;
        transition: transform 0.3s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .slider.right {
        transform: translateX(100%);
    }

    .mic-icon {
        font-size: 24px;
        transition: all 0.3s ease;
    }

    .mic-icon.muted {
        color: #f44336;
    }

    .mic-icon.unmuted {
        color: #4caf50;
    }

    .side-text {
        font-size: 7px;
        color: #666;
        white-space: nowrap;
    }

    /* Hover effects */
    .toggle-switch:hover .slider {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .toggle-side:hover {
        opacity: 0.9;
    }
</style>
