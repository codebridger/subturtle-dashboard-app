/** A single entry in the sidebar. `id` is what `@navigate` emits and what `active` matches. */
export interface StNavItem {
    id: string;
    label: string;
    /** Iconify name, e.g. 'solar:chart-2-bold-duotone'. Must be in the generated icon set. */
    icon?: string;
    /** Rendered when not null/undefined — `0` is shown, matching the design. */
    badge?: string | number | null;
}

export interface StNavGroup {
    /** Uppercase eyebrow above the group. Omit for an unlabelled group. */
    section?: string;
    items: StNavItem[];
}

/** One row in StProfileMenu. Mirrors ProfileMenuItem from the design system's .d.ts. */
export interface StProfileMenuItem {
    /** Row label — sentence case ("Sign out", not "Sign Out"). */
    label: string;
    /** Iconify Solar icon name, e.g. 'solar:settings-linear'. Must be in the generated set. */
    icon: string;
    /** Destructive row: rose-red text, red-tinted hover. */
    danger?: boolean;
    /** Draw a hairline divider above this row. */
    dividerBefore?: boolean;
    /** Optional trailing micro-label (counter, shortcut). Omit rather than showing a placeholder. */
    meta?: string;
    onClick?: () => void;
}

/** The three states of the appearance switch. `system` follows `prefers-color-scheme`. */
export type StTheme = 'light' | 'dark' | 'system';

export type StTone = 'primary' | 'accent' | 'neutral' | 'danger';
export type StSize = 'sm' | 'md' | 'lg';
export type StPadding = 'none' | 'sm' | 'md' | 'lg';
export type StElevation = 'none' | 'sm' | 'md' | 'lg';
