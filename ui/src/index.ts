/**
 * subturtle-ui — the Subturtle design system as Vue 3 components.
 *
 * Consumers must also import the stylesheet once:
 *   import 'subturtle-ui/style.css';
 * It carries the design tokens and every component's compiled CSS. All emitted classes are
 * prefixed `st-`, so it cannot collide with the host application's own Tailwind build.
 */
import './styles/index.css';

// Icon
export { default as StIcon } from './icon/StIcon.vue';

// Elements
export { default as StAvatar } from './elements/StAvatar.vue';
export { default as StBadge } from './elements/StBadge.vue';
export { default as StButton } from './elements/StButton.vue';
export { default as StCard } from './elements/StCard.vue';
export { default as StEmptyState } from './elements/StEmptyState.vue';
export { default as StIconButton } from './elements/StIconButton.vue';
export { default as StSkeleton } from './elements/StSkeleton.vue';

// Brand
export { default as StBundleCard } from './brand/StBundleCard.vue';
export { default as StPlanPill } from './brand/StPlanPill.vue';
export { default as StStatTile } from './brand/StStatTile.vue';

// Shell
export { default as StAppShell } from './shell/StAppShell.vue';
export { default as StProfileMenu } from './shell/StProfileMenu.vue';
export { default as StSidebarNav } from './shell/StSidebarNav.vue';

export type { StNavGroup, StNavItem, StProfileMenuItem, StTheme, StTone, StSize, StPadding, StElevation } from './types';
