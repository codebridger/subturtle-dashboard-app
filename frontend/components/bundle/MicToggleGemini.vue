<template>
    <div class="toggle-container">
        <div class="toggle-switch" :class="{ 'right-active': !isToggleMode }">
            <!-- Left side (Toggle Mute/Unmute) -->
            <div class="toggle-side left" :class="{ active: isToggleMode }" @click="handleLeftClick">
                <template v-if="isToggleMode">
                    <Icon
                        :name="isMuted ? 'iconify clarity--microphone-mute-line' : 'iconify solar--microphone-line-duotone'"
                        class="mic-icon" :class="{ muted: isMuted, unmuted: !isMuted }" />
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
// Mic mute/unmute toggle bound to the Gemini live-session store. Identical UI
// and behaviour to `MicToggle.vue`, but that one talks to the OpenAI store —
// a single shared component would mute/unmute the wrong store on the Gemini
// practice page. Once the OpenAI flow is removed, both files can collapse
// into one again.
import { Icon } from 'pilotui/elements';
import { ref, computed, watch } from 'vue';
import { useLiveSessionGeminiStore } from '~/stores/liveSessionGemini';

const liveSessionStore = useLiveSessionGeminiStore();

const isToggleMode = ref(true);

const isMuted = computed(() => liveSessionStore.getMicrophoneMuted);

function switchToToggleMode() {
    if (!isToggleMode.value) {
        isToggleMode.value = true;
        if (!isMuted.value) {
            liveSessionStore.toggleMicrophone();
        }
    }
}

function switchToAlwaysOn() {
    if (isToggleMode.value) {
        isToggleMode.value = false;
        if (isMuted.value) {
            liveSessionStore.toggleMicrophone();
        }
    }
}

function handleLeftClick() {
    if (isToggleMode.value) {
        liveSessionStore.toggleMicrophone();
    } else {
        switchToToggleMode();
    }
}

function handleRightClick() {
    if (!isToggleMode.value) {
        return;
    } else {
        switchToAlwaysOn();
    }
}

watch(isToggleMode, (newValue) => {
    if (!newValue && isMuted.value) {
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

.toggle-switch:hover .slider {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.toggle-side:hover {
    opacity: 0.9;
}
</style>
