export function waitFor(
    condition: () => boolean,
    interval: number = 1000,
    timeout: number = 30000 // 30 second default timeout
) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let timeoutId: NodeJS.Timeout;

        const check = () => {
            try {
                if (condition()) {
                    clearTimeout(timeoutId);
                    resolve(true);
                    return;
                }

                // Check if we've exceeded the timeout
                if (Date.now() - startTime > timeout) {
                    clearTimeout(timeoutId);
                    reject(new Error('waitFor timeout exceeded'));
                    return;
                }

                timeoutId = setTimeout(check, interval);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        };

        check();
    });
}
