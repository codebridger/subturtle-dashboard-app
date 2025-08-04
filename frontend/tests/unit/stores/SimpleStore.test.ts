import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { defineStore } from 'pinia';

// Simple test store
const useSimpleStore = defineStore('simple', {
    state: () => ({
        count: 0,
        items: [] as string[],
    }),
    getters: {
        doubleCount: (state) => state.count * 2,
        itemCount: (state) => state.items.length,
    },
    actions: {
        increment() {
            this.count++;
        },
        addItem(item: string) {
            this.items.push(item);
        },
        removeItem(item: string) {
            const index = this.items.indexOf(item);
            if (index > -1) {
                this.items.splice(index, 1);
            }
        },
    },
});

describe('Simple Store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('initializes with correct state', () => {
        const store = useSimpleStore();
        expect(store.count).toBe(0);
        expect(store.items).toEqual([]);
    });

    it('increments count correctly', () => {
        const store = useSimpleStore();
        store.increment();
        expect(store.count).toBe(1);
    });

    it('adds items correctly', () => {
        const store = useSimpleStore();
        store.addItem('test item');
        expect(store.items).toContain('test item');
        expect(store.items).toHaveLength(1);
    });

    it('removes items correctly', () => {
        const store = useSimpleStore();
        store.addItem('test item');
        store.addItem('another item');
        store.removeItem('test item');
        expect(store.items).not.toContain('test item');
        expect(store.items).toContain('another item');
        expect(store.items).toHaveLength(1);
    });

    it('calculates getters correctly', () => {
        const store = useSimpleStore();
        store.increment();
        store.increment();
        expect(store.doubleCount).toBe(4);

        store.addItem('item1');
        store.addItem('item2');
        expect(store.itemCount).toBe(2);
    });
});
