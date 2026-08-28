<template>
    <!--
        Auth frame for screens already migrated to subturtle-ui. Deliberately free of pilotui:
        no <App> provider, no blue screen_loader, no useAppStore. `auth.vue` stays as-is for the
        auth screens still on the old library, and should give this one its name once the last
        of them is migrated.

        The page fills the viewport exactly and clips its own overflow, because the login screen's
        board preview is positioned past the right edge.
    -->
    <div class="relative h-[100dvh] overflow-hidden bg-st-page font-st-sans text-st-body">
        <!-- Ambient brand wash. Purely decorative, and behind everything. -->
        <span
            aria-hidden="true"
            class="pointer-events-none absolute -right-[220px] -top-[320px] h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,rgb(var(--rose-500)/0.09),transparent_62%)]"
        />
        <span
            aria-hidden="true"
            class="pointer-events-none absolute -bottom-[260px] -left-[180px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgb(var(--jade-500)/0.08),transparent_62%)]"
        />

        <NuxtPage />
    </div>
</template>
