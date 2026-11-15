import { authentication, functionProvider } from '@modular-rest/client';
import { errorText } from '~/utils/languageApi';

/**
 * Deletes the signed-in learner's account and everything stored for it (server function
 * `delete-account`, the one the mobile app uses). The server cancels a live subscription
 * first and deletes nothing when that fails, and it is safe to run again, so a failed call
 * can simply be retried.
 *
 * Throws an `Error` whose message is the server's reason when it gave one.
 */
export async function deleteAccount(): Promise<void> {
    // modular-rest never hands a function its caller, so the function reads `userId` from
    // its args; the server's functionCallerGuard pins it to the token.
    const userId = authentication.user?.id;
    if (!userId) throw new Error('Not signed in');

    try {
        await functionProvider.run({ name: 'delete-account', args: { userId } });
    } catch (error) {
        throw new Error(errorText(error) || 'request failed');
    }
}
