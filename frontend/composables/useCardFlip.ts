import { ref, watch } from 'vue';

/**
 * Flip state for a flashcard. `resetKey` is a getter that changes when the card changes
 * (e.g. the front text) — when it changes, the card flips back to the front automatically.
 */
export function useCardFlip(resetKey: () => unknown) {
    const isFlipped = ref(false);

    function flipCard() {
        isFlipped.value = !isFlipped.value;
    }

    watch(resetKey, () => {
        isFlipped.value = false;
    });

    return { isFlipped, flipCard };
}
