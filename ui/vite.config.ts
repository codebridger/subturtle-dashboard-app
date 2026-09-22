import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [
        vue(),
        // Emit real .d.ts instead of shipping src/ and pointing `types` at .ts files —
        // that shortcut is why consuming pilotui needs a `// @ts-ignore` on its import.
        dts({ tsconfigPath: './tsconfig.build.json', insertTypesEntry: true, rollupTypes: false }),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es', 'cjs'],
            fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
        },
        rollupOptions: {
            external: ['vue'],
            output: { globals: { vue: 'Vue' }, assetFileNames: 'style.css' },
        },
        cssCodeSplit: false,
        sourcemap: true,
        // Ship readable output and let each consumer's bundler minify. Beyond being the
        // convention for libraries, esbuild's identifier mangling collided across the
        // concatenated SFC modules here and produced a duplicate top-level binding that
        // Rollup rejected downstream.
        minify: false,
    },
});
