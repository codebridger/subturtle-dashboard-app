/**
 * Live sessions have no stored duration field. We approximate it as the span
 * between the record's first write (`createdAt`, set when the session is
 * established) and its last write (`updatedAt`, bumped on every dialog/usage
 * flush). This slightly undershoots wall-clock length because teardown writes
 * nothing — trailing idle time after the last turn isn't captured.
 */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;

    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

export function formatSessionDuration(createdAt: string | Date, updatedAt: string | Date): string {
    return formatDuration(new Date(updatedAt).getTime() - new Date(createdAt).getTime());
}
