import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

// Simple test component
const SimpleComponent = {
    template: `
    <div>
      <h1>{{ title }}</h1>
      <p>{{ message }}</p>
      <button @click="increment">{{ count }}</button>
    </div>
  `,
    props: {
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            default: 'Default message',
        },
    },
    data() {
        return {
            count: 0,
        };
    },
    methods: {
        increment() {
            this.count++;
            this.$emit('incremented', this.count);
        },
    },
};

describe('SimpleComponent', () => {
    it('renders props correctly', () => {
        const wrapper = mount(SimpleComponent, {
            props: {
                title: 'Test Title',
                message: 'Test Message',
            },
        });

        expect(wrapper.text()).toContain('Test Title');
        expect(wrapper.text()).toContain('Test Message');
    });

    it('emits event when button is clicked', async () => {
        const wrapper = mount(SimpleComponent, {
            props: {
                title: 'Test',
            },
        });

        await wrapper.find('button').trigger('click');

        expect(wrapper.emitted('incremented')).toBeTruthy();
        expect(wrapper.emitted('incremented')?.[0]).toEqual([1]);
    });

    it('uses default message when not provided', () => {
        const wrapper = mount(SimpleComponent, {
            props: {
                title: 'Test',
            },
        });

        expect(wrapper.text()).toContain('Default message');
    });
});
