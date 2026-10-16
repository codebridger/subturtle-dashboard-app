import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { cpus } from 'os';

// Locally, half the cores so a full run does not fill the machine's memory. CI keeps Vitest's default.
// Vitest 1 takes a number here, not "50%".
const localWorkers = Math.max(1, Math.floor(cpus().length / 2));

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
        ...(process.env.CI ? {} : { maxWorkers: localWorkers, minWorkers: 1 }),
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
