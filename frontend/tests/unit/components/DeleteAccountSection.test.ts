import { describe, it, expect, vi, beforeEach } from 'vitest';
// The global setup mocks `vue`; restore the real implementation so SFC reactivity works.
vi.mock('vue', async () => await vi.importActual('vue'));
import { mount, flushPromises } from '@vue/test-utils';

const mockRun = vi.fn();
vi.mock('@modular-rest/client', () => ({
    authentication: { user: { id: 'user-1' } },
    functionProvider: { run: (args: any) => mockRun(args) },
}));

const mockLogout = vi.fn();
vi.mock('~/stores/profile', () => ({ useProfileStore: () => ({ logout: mockLogout }) }));

vi.stubGlobal('useI18n', () => ({ t: (key: string, params?: Record<string, string>) => (params?.reason ? `${key}|${params.reason}` : key) }));

import DeleteAccountSection from '~/components/profile/DeleteAccountSection.vue';

// StModal teleports to <body>, so the dialog is found on the document, not the wrapper.
const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function mountSection() {
    return mount(DeleteAccountSection, { attachTo: document.body });
}

describe('DeleteAccountSection', () => {
    const reload = vi.fn();

    beforeEach(() => {
        document.body.innerHTML = '';
        mockRun.mockReset();
        vi.stubGlobal('location', { ...window.location, reload });
    });

    it('shows the section with the dialog closed', () => {
        mountSection();
        expect(byTestId('delete-account-section')).toBeTruthy();
        expect(byTestId('delete-account-confirm')).toBeNull();
    });

    it('opens a dialog that says what is lost, before anything is called', async () => {
        const w = mountSection();
        await w.get('[data-testid="delete-account-open"]').trigger('click');

        expect(document.body.textContent).toContain('account.delete.message');
        expect(mockRun).not.toHaveBeenCalled();
    });

    it('calls delete-account with the user id, then signs out and reloads', async () => {
        mockRun.mockResolvedValue({ userId: 'user-1' });
        const w = mountSection();
        await w.get('[data-testid="delete-account-open"]').trigger('click');
        byTestId('delete-account-confirm')!.click();
        await flushPromises();

        expect(mockRun).toHaveBeenCalledWith({ name: 'delete-account', args: { userId: 'user-1' } });
        expect(mockLogout).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('disables the buttons while the call runs and ignores a second click', async () => {
        let finish!: (v: unknown) => void;
        mockRun.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        const w = mountSection();
        await w.get('[data-testid="delete-account-open"]').trigger('click');
        byTestId('delete-account-confirm')!.click();
        await flushPromises();

        expect((byTestId('delete-account-confirm') as HTMLButtonElement).disabled).toBe(true);
        byTestId('delete-account-confirm')!.click();
        await flushPromises();
        expect(mockRun).toHaveBeenCalledTimes(1);

        finish({});
        await flushPromises();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('shows the server reason on failure, stays signed in, and lets the learner retry', async () => {
        mockRun.mockRejectedValueOnce({ error: 'Could not cancel the Stripe subscription, so the account was not deleted: Stripe is down' });
        const w = mountSection();
        await w.get('[data-testid="delete-account-open"]').trigger('click');
        byTestId('delete-account-confirm')!.click();
        await flushPromises();

        expect(byTestId('delete-account-error')!.textContent).toContain('Stripe is down');
        expect(mockLogout).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        expect((byTestId('delete-account-confirm') as HTMLButtonElement).disabled).toBe(false);

        mockRun.mockResolvedValueOnce({});
        byTestId('delete-account-confirm')!.click();
        await flushPromises();
        expect(mockRun).toHaveBeenCalledTimes(2);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
