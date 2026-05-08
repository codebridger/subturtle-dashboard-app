<template>
    <div class="toggle-container">
        <div class="toggle-switch" :class="{ 'right-active': !isToggleMode }">
            <!-- Left side: tap to mute/unmute -->
            <div class="toggle-side left" :class="{ active: isToggleMode }" @click="handleLeftClick"
                title="Tap to mute or unmute the microphone.">
                <template v-if="isToggleMode">
                    <Icon
                        :name="isMuted ? 'iconify clarity--microphone-mute-line' : 'iconify solar--microphone-line-duotone'"
                        class="mic-icon" :class="{ muted: isMuted, unmuted: !isMuted }" />
                </template>
                <span v-else class="side-text">Tap to talk</span>
            </div>

            <!-- Right side: always unmuted (hands-free) -->
            <div class="toggle-side right" :class="{ active: !isToggleMode }" @click="handleRightClick"
                title="Hands-free: keep the microphone open for the whole session.">
                <template v-if="!isToggleMode">
                    <Icon name="iconify solar--microphone-line-duotone" class="mic-icon unmuted" />
                </template>
                <span v-else class="side-text">Hands-free</span>
            </div>

            <!-- Sliding indicator -->
            <div class="slider" :class="{ right: !isToggleMode }"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
// Mic mute/unmute toggle bound to the Gemini live-session store.
import { Icon } from 'pilotui/elements';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useLiveSessionGeminiStore } from '~/stores/liveSessionGemini';

const liveSessionStore = useLiveSessionGeminiStore();

const isToggleMode = ref(true);

const isMuted = computed(() => liveSessionStore.getMicrophoneMuted);

function switchToToggleMode() {
    if (!isToggleMode.value) {
        isToggleMode.value = true;
        if (!isMuted.value) {
            liveSessionStore.toggleMicrophone(false);
        }
    }
}

function switchToAlwaysOn() {
    if (isToggleMode.value) {
        isToggleMode.value = false;
        if (isMuted.value) {
            liveSessionStore.toggleMicrophone(true);
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

// Global spacebar shortcut: toggles the mic from anywhere on the page while
// we're in tap-to-toggle mode. Skipped if the user is typing in an input or
// already in hands-free, so we don't fight unrelated keyboard interactions.
function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function onSpaceKeyDown(event: KeyboardEvent) {
    if (event.code !== 'Space') return;
    if (event.repeat) return;
    if (!isToggleMode.value) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    liveSessionStore.toggleMicrophone();
}

onMounted(() => {
    window.addEventListener('keydown', onSpaceKeyDown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', onSpaceKeyDown);
});

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
