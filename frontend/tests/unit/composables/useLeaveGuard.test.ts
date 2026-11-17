import { afterEach, describe, it, expect, vi } from 'vitest';
// The global setup mocks `vue`; restore the real implementation so refs and lifecycle work.
vi.mock('vue', async () => await vi.importActual('vue'));
import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { RouterView, createMemoryHistory, createRouter } from 'vue-router';
import { useLeaveGuard } from '~/composables/useLeaveGuard';

/** A page whose guard is driven by `dirty`; `save` stands in for the page's own save. */
function setup({ dirty = true, save }: { dirty?: boolean; save?: () => Promise<boolean> } = {}) {
    const isDirty = ref(dirty);
    let guard!: ReturnType<typeof useLeaveGuard>;
    const Page = defineComponent({
        setup() {
            guard = useLeaveGuard({ when: () => isDirty.value, save });
            return () => h('div', 'page');
        },
    });
    const Other = defineComponent({ render: () => h('div', 'other') });

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/page', component: Page },
            { path: '/other', component: Other },
        ],
    });
    return { router, isDirty, guard: () => guard, Root: defineComponent({ render: () => h('div', [h(RouterView)]) }) };
}

const mounted: Array<{ unmount: () => void }> = [];
// A page that stays mounted keeps its beforeunload listener, and would answer the next test's event.
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

async function mountOn(path: string, opts?: Parameters<typeof setup>[0]) {
    const ctx = setup(opts);
    await ctx.router.push(path);
    await ctx.router.isReady();
    const wrapper = mount(ctx.Root, { global: { plugins: [ctx.router] } });
    await flushPromises();
    mounted.push(wrapper);
    return { ...ctx, wrapper };
}

describe('useLeaveGuard', () => {
    it('asks before a route change while there is something unsaved, and stays until answered', async () => {
        const { router, guard } = await mountOn('/page');

        const navigation = router.push('/other');
        await flushPromises();

        expect(guard().open.value).toBe(true);
        expect(router.currentRoute.value.path).toBe('/page');

        guard().choose('leave');
        await navigation;
        expect(router.currentRoute.value.path).toBe('/other');
        expect(guard().open.value).toBe(false);
    });

    it('"stay" cancels the route change', async () => {
        const { router, guard } = await mountOn('/page');

        const navigation = router.push('/other');
        await flushPromises();
        guard().choose('stay');
        await navigation;

        expect(router.currentRoute.value.path).toBe('/page');
        expect(guard().open.value).toBe(false);
    });

    it('"save" saves first, then lets the route change go on', async () => {
        const save = vi.fn().mockResolvedValue(true);
        const { router, guard } = await mountOn('/page', { save });

        const navigation = router.push('/other');
        await flushPromises();
        guard().choose('save');
        await navigation;

        expect(save).toHaveBeenCalledTimes(1);
        expect(router.currentRoute.value.path).toBe('/other');
    });

    it('keeps the learner on the page when the save fails', async () => {
        const save = vi.fn().mockResolvedValue(false);
        const { router, guard } = await mountOn('/page', { save });

        const navigation = router.push('/other');
        await flushPromises();
        guard().choose('save');
        await navigation;

        expect(save).toHaveBeenCalledTimes(1);
        expect(router.currentRoute.value.path).toBe('/page');
    });

    it('does not ask when there is nothing unsaved', async () => {
        const { router, guard } = await mountOn('/page', { dirty: false });

        await router.push('/other');

        expect(guard().open.value).toBe(false);
        expect(router.currentRoute.value.path).toBe('/other');
    });

    it('sets the browser prompt on reload or close only while there is something unsaved', async () => {
        const { isDirty } = await mountOn('/page');

        const dirtyEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(dirtyEvent);
        expect(dirtyEvent.defaultPrevented).toBe(true);

        isDirty.value = false;
        const cleanEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(cleanEvent);
        expect(cleanEvent.defaultPrevented).toBe(false);
    });

    it('removes the browser prompt when the page goes away', async () => {
        const { wrapper } = await mountOn('/page');
        wrapper.unmount();

        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });
});
