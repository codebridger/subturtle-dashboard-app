import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
        include: [
            'tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'components/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'composables/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'utils/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'stores/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],
        exclude: ['node_modules', 'dist', '.nuxt', '.output'],
        deps: {
            inline: ['vue', 'vue-i18n', '@vue/test-utils'],
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './'),
            '~': resolve(__dirname, './'),
            '~~': resolve(__dirname, './'),
            '@@': resolve(__dirname, './'),
            '##': resolve(__dirname, './'),
            '#app': resolve(__dirname, './.nuxt/app'),
        },
    },
});
