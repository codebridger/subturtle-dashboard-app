import { vi } from 'vitest';
import { config } from '@vue/test-utils';

// Global test setup
beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
});

// Configure Vue Test Utils globally
config.global.stubs = {
    // Stub Nuxt components that might not be available in tests
    NuxtLink: true,
    NuxtPage: true,
    NuxtLayout: true,
    ClientOnly: true,
    NuxtImg: true,
    NuxtIcon: true,
};

// Mock Vue 3 composables
vi.mock('vue', async () => {
    const actual = await vi.importActual('vue');
    return {
        ...actual,
        ref: vi.fn((value) => ({ value })),
        computed: vi.fn((getter) => ({ value: getter() })),
        reactive: vi.fn((obj) => obj),
        watch: vi.fn(),
        watchEffect: vi.fn(),
        onMounted: vi.fn(),
        onUnmounted: vi.fn(),
        nextTick: vi.fn().mockResolvedValue(undefined),
    };
});

// Mock Nuxt composables
vi.mock('#app', () => ({
    useRuntimeConfig: () => ({
        public: {
            BASE_URL_API: 'http://localhost:3000',
            isProduction: false,
            isNotProduction: true,
            mode: 'development',
            MIXPANEL_PROJECT_TOKEN: 'test-token',
            MIXPANEL_API_HOST: 'https://api.mixpanel.com',
        },
    }),
    useNuxtApp: () => ({
        $router: {
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
        },
        $route: {
            path: '/',
            query: {},
            params: {},
        },
    }),
    navigateTo: vi.fn(),
    useRoute: () => ({
        path: '/',
        query: {},
        params: {},
    }),
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        back: vi.fn(),
    }),
}));

// Mock i18n
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        locale: { value: 'en' },
        locales: { value: ['en'] },
    }),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));
