/**
 * True when a request failed because the session itself is dead: the token's user no longer
 * exists (412 "User not found" / "Precondition Failed"), the token was refused (401), or the
 * API's caller guard rejected it. @modular-rest/client drops the HTTP status and rejects with
 * the response body, so this matches the body text.
 */
export function isDeadSessionError(error: unknown): boolean {
    const text = typeof error === 'string' ? error : (error as any)?.error || (error as any)?.message || '';
    return /user not found|precondition failed|unauthorized|a function can only act on the signed-in user/i.test(String(text));
}
