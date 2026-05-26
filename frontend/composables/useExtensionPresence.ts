const PROBE_TIMEOUT_MS = 500;

// Module-scoped so every caller shares one probe per app session.
const extensionPresent = ref<boolean | null>(null);
let initialized = false;

export function useExtensionPresence() {
    if (!initialized && import.meta.client) {
        initialized = true;

        window.addEventListener('message', (event: MessageEvent) => {
            if (event.source !== window) return;
            const data = event.data;
            if (data?.source === 'subturtle-extension' && data?.type === 'presence') {
                extensionPresent.value = true;
            }
        });

        // Ping the extension content script in case it loaded before our listener.
        try {
            window.postMessage({ source: 'subturtle-dashboard', type: 'ping' }, window.location.origin);
        } catch (_e) {
            // postMessage can fail in unusual sandboxed contexts — non-fatal.
        }

        // Conclude "not present" if no response arrives within the probe window.
        setTimeout(() => {
            if (extensionPresent.value === null) extensionPresent.value = false;
        }, PROBE_TIMEOUT_MS);
    }

    return { extensionPresent };
}
