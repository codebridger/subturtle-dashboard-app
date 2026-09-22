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

export type StTone = 'primary' | 'accent' | 'neutral' | 'danger';
export type StSize = 'sm' | 'md' | 'lg';
export type StPadding = 'none' | 'sm' | 'md' | 'lg';
export type StElevation = 'none' | 'sm' | 'md' | 'lg';
