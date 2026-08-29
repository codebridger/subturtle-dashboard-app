/**
 * Design tokens exposed to a CONSUMING app's Tailwind config.
 *
 * The library's own components compile against tailwind.config.cjs and ship as static CSS, so
 * they need none of this. But an app also writes page-level markup in the design system's
 * language, and its Tailwind knows nothing about our tokens. Spread this into `theme.extend`
 * to get an `st-` namespace beside the app's existing scales:
 *
 *   // tailwind.config.cjs
 *   const stTokens = require('subturtle-ui/tailwind-tokens');
 *   theme: { extend: { ...stTokens } }
 *
 *   <div class="rounded-st-lg bg-st-card text-st-strong shadow-st-sm">
 *
 * Everything resolves to the CSS custom properties in dist/style.css, so values have exactly
 * one source of truth (src/styles/tokens.css) and a future dark theme reaches app markup too.
 * Names are additive — no existing app color, radius or size is touched.
 */
const c = (token) => `rgb(var(${token}) / <alpha-value>)`;

module.exports = {
    colors: {
        st: {
            primary: c('--color-primary'),
            'primary-hover': c('--color-primary-hover'),
            'primary-soft': c('--color-primary-soft'),
            'primary-tint': c('--color-primary-tint'),
            accent: c('--color-accent'),
            'accent-soft': c('--color-accent-soft'),

            strong: c('--text-strong'),
            body: c('--text-body'),
            muted: c('--text-muted'),
            faint: c('--text-faint'),
            link: c('--text-link'),

            page: c('--surface-page'),
            card: c('--surface-card'),
            sunken: c('--surface-sunken'),
            inverse: c('--surface-inverse'),
            line: c('--border-subtle'),

            success: c('--color-success'),
            'success-soft': c('--color-success-soft'),
            warning: c('--color-warning'),
            'warning-soft': c('--color-warning-soft'),
            danger: c('--color-danger'),
            'danger-soft': c('--color-danger-soft'),
            info: c('--color-info'),
            'info-soft': c('--color-info-soft'),

            'rose-400': c('--rose-400'),
            'rose-600': c('--rose-600'),
            'rose-700': c('--rose-700'),
            'jade-600': c('--jade-600'),
            'jade-700': c('--jade-700'),
            'amber-600': c('--amber-600'),
            'red-600': c('--red-600'),
            'sky-600': c('--sky-600'),
            'ink-100': c('--ink-100'),
            'ink-150': c('--ink-150'),
            'ink-200': c('--ink-200'),
            'ink-300': c('--ink-300'),
            'ink-700': c('--ink-700'),
            'ink-800': c('--ink-800'),
            'ink-950': c('--ink-950'),
        },
    },
    fontFamily: {
        'st-display': 'var(--font-display)',
        'st-sans': 'var(--font-sans)',
    },
    fontSize: {
        'st-2xs': 'var(--text-2xs)',
        'st-xs': 'var(--text-xs)',
        'st-sm': 'var(--text-sm)',
        'st-base': 'var(--text-base)',
        'st-md': 'var(--text-md)',
        'st-lg': 'var(--text-lg)',
        'st-xl': 'var(--text-xl)',
        'st-2xl': 'var(--text-2xl)',
        'st-3xl': 'var(--text-3xl)',
    },
    letterSpacing: {
        'st-tight': 'var(--tracking-tight)',
        'st-caps': 'var(--tracking-caps)',
    },
    borderRadius: {
        'st-sm': 'var(--radius-sm)',
        'st-md': 'var(--radius-md)',
        'st-lg': 'var(--radius-lg)',
        'st-xl': 'var(--radius-xl)',
        'st-pill': 'var(--radius-pill)',
    },
    boxShadow: {
        'st-xs': 'var(--shadow-xs)',
        'st-sm': 'var(--shadow-sm)',
        'st-md': 'var(--shadow-md)',
        'st-lg': 'var(--shadow-lg)',
        'st-xl': 'var(--shadow-xl)',
        'st-primary': 'var(--shadow-primary)',
    },
    maxWidth: {
        'st-container': 'var(--container-max)',
        'st-content': 'var(--content-max)',
    },
};
