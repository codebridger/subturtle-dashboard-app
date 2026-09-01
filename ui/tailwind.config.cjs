/**
 * Library-private Tailwind config.
 *
 * Two properties matter and must not be changed casually:
 *   - `prefix: 'st-'` keeps every emitted class out of the host app's namespace. The compiled
 *     dist/style.css loads alongside the consumer's own Tailwind build, so an unprefixed
 *     `.rounded-lg` or `.bg-primary` would silently fight it and load order would decide.
 *   - preflight is off, so the library never injects a global reset into a host page.
 *
 * Because of those two, this config never has to agree with any consumer's Tailwind config.
 * Colors resolve through CSS custom properties (space-separated RGB channels) so opacity
 * modifiers work and a future dark theme is a pure-CSS change. See src/styles/tokens.css.
 */
const c = (token) => `rgb(var(${token}) / <alpha-value>)`;

const scale = (name, steps) => Object.fromEntries(steps.map((s) => [String(s), c(`--${name}-${s}`)]));

module.exports = {
    prefix: 'st-',
    darkMode: 'class',
    content: ['./src/**/*.{vue,ts}'],
    corePlugins: { preflight: false },
    theme: {
        colors: {
            transparent: 'transparent',
            current: 'currentColor',
            inherit: 'inherit',
            white: c('--white'),
            paper: c('--paper'),
            rose: scale('rose', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
            jade: scale('jade', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
            ink: scale('ink', [50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
            amber: scale('amber', [100, 500, 600]),
            red: scale('red', [100, 500, 600]),
            sky: scale('sky', [100, 500, 600]),

            primary: {
                DEFAULT: c('--color-primary'),
                hover: c('--color-primary-hover'),
                press: c('--color-primary-press'),
                soft: c('--color-primary-soft'),
                tint: c('--color-primary-tint'),
                on: c('--color-on-primary'),
            },
            accent: {
                DEFAULT: c('--color-accent'),
                hover: c('--color-accent-hover'),
                soft: c('--color-accent-soft'),
                tint: c('--color-accent-tint'),
                on: c('--color-on-accent'),
            },
            success: { DEFAULT: c('--color-success'), soft: c('--color-success-soft') },
            warning: { DEFAULT: c('--color-warning'), soft: c('--color-warning-soft') },
            danger: { DEFAULT: c('--color-danger'), soft: c('--color-danger-soft') },
            info: { DEFAULT: c('--color-info'), soft: c('--color-info-soft') },
        },
        extend: {
            textColor: {
                strong: c('--text-strong'),
                body: c('--text-body'),
                muted: c('--text-muted'),
                faint: c('--text-faint'),
                link: c('--text-link'),
                'on-dark': c('--text-on-dark'),
                // The readable pairing for `bg-inverse`: it is the page colour, so it flips
                // with the surface instead of being a literal that only works in one theme.
                page: c('--surface-page'),
            },
            backgroundColor: {
                page: c('--surface-page'),
                card: c('--surface-card'),
                sunken: c('--surface-sunken'),
                raised: c('--surface-raised'),
                inverse: c('--surface-inverse'),
                // Scrims and image-overlay pills. NOT `ink-950` — that ramp inverts in dark,
                // so a scrim written against it would turn into a white veil.
                overlay: c('--surface-overlay'),
            },
            borderColor: {
                DEFAULT: c('--border-subtle'),
                subtle: c('--border-subtle'),
                strong: c('--border-strong'),
                // For rings that punch a component out of whatever it sits on (the avatar's).
                // `white` would be a literal, and literal white is only ever ink on a rose CTA.
                card: c('--surface-card'),
            },
            fontFamily: {
                sans: 'var(--font-sans)',
                display: 'var(--font-display)',
                mono: 'var(--font-mono)',
            },
            fontSize: {
                '2xs': 'var(--text-2xs)',
                xs: 'var(--text-xs)',
                sm: 'var(--text-sm)',
                base: 'var(--text-base)',
                md: 'var(--text-md)',
                lg: 'var(--text-lg)',
                xl: 'var(--text-xl)',
                '2xl': 'var(--text-2xl)',
                '3xl': 'var(--text-3xl)',
                '4xl': 'var(--text-4xl)',
            },
            lineHeight: {
                tight: 'var(--leading-tight)',
                snug: 'var(--leading-snug)',
                normal: 'var(--leading-normal)',
                relaxed: 'var(--leading-relaxed)',
            },
            letterSpacing: {
                tight: 'var(--tracking-tight)',
                normal: 'var(--tracking-normal)',
                wide: 'var(--tracking-wide)',
                caps: 'var(--tracking-caps)',
            },
            borderRadius: {
                none: '0',
                xs: 'var(--radius-xs)',
                sm: 'var(--radius-sm)',
                md: 'var(--radius-md)',
                lg: 'var(--radius-lg)',
                xl: 'var(--radius-xl)',
                '2xl': 'var(--radius-2xl)',
                pill: 'var(--radius-pill)',
                circle: 'var(--radius-circle)',
                full: '9999px',
            },
            boxShadow: {
                xs: 'var(--shadow-xs)',
                sm: 'var(--shadow-sm)',
                md: 'var(--shadow-md)',
                lg: 'var(--shadow-lg)',
                xl: 'var(--shadow-xl)',
                primary: 'var(--shadow-primary)',
                accent: 'var(--shadow-accent)',
                inset: 'var(--shadow-inset)',
                none: 'none',
            },
            transitionDuration: {
                fast: 'var(--dur-fast)',
                base: 'var(--dur-base)',
                slow: 'var(--dur-slow)',
            },
            transitionTimingFunction: {
                out: 'var(--ease-out)',
                'in-out': 'var(--ease-in-out)',
                spring: 'var(--ease-spring)',
            },
            width: { sidebar: 'var(--sidebar-w)' },
            maxWidth: { container: 'var(--container-max)', content: 'var(--content-max)' },
            height: {
                'control-sm': 'var(--control-h-sm)',
                'control-md': 'var(--control-h-md)',
                'control-lg': 'var(--control-h-lg)',
            },
            padding: { card: 'var(--card-pad)', 'card-lg': 'var(--card-pad-lg)' },
            zIndex: {
                sticky: 'var(--z-sticky)',
                overlay: 'var(--z-overlay)',
                modal: 'var(--z-modal)',
                toast: 'var(--z-toast)',
                tooltip: 'var(--z-tooltip)',
            },
        },
    },
    plugins: [],
};
