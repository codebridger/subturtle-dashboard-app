<template>
    <StLanguageMenu
        v-if="language.enabled && language.languages.length"
        :current="current"
        :languages="rows"
        :actions="actions"
        :labels="{ menu: t('languages.menu.label'), heading: t('languages.menu.label'), trigger: t('languages.menu.trigger') }"
        @select="onSelect"
    />
</template>

<script setup lang="ts">
    import { StLanguageMenu, type StLanguageMenuAction, type StLanguageMenuItem } from 'subturtle-ui';
    import { useLanguageStore } from '~/stores/language';
    import { useLanguageSwitch } from '~/composables/useLanguageSwitch';
    import { shortCode } from '~/utils/languages';

    /**
     * The header language menu (D-02), left of the theme switch on every screen. Hidden while
     * multilingual is off, so today's English-only dashboard shows nothing new.
     */
    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();
    const { switchTo } = useLanguageSwitch();

    const current = computed(() => {
        const code = language.activeLanguage;
        const level = language.activeSummary?.startLevel;
        return {
            chip: shortCode(code),
            name: language.nameOf(code),
            level: level ? t('languages.menu.starting-at', { level }) : undefined,
        };
    });

    /** "German · Deutsch" with "Starting at A1 · 7 due · 38 phrases" (Q12, Q13). */
    const rows = computed<StLanguageMenuItem[]>(() =>
        language.languages.map((l) => {
            const name = language.nameOf(l.code);
            const native = language.nativeNameOf(l.code);
            return {
                code: l.code,
                chip: shortCode(l.code),
                label: native && native !== name ? `${name} · ${native}` : name,
                meta: t('languages.menu.row-meta', { level: l.startLevel, due: l.dueCount, phrases: l.phraseCount }),
                active: l.code === language.activeLanguage,
            };
        })
    );

    const actions = computed<StLanguageMenuAction[]>(() => {
        const list: StLanguageMenuAction[] = [
            {
                label: t('languages.menu.add'),
                icon: 'solar:add-circle-bold',
                meta: t('languages.menu.used', { used: language.usedCount, max: language.maxLanguages }),
                dividerBefore: true,
                onClick: () => router.push('/settings/languages/add'),
            },
            { label: t('languages.menu.manage'), icon: 'solar:settings-linear', onClick: () => router.push('/settings/languages') },
        ];
        const own = language.ownLanguage;
        if (own) {
            list.push({
                label: t('languages.menu.you-speak', { language: language.nameOf(own) }),
                meta: t('languages.menu.you-speak-sub'),
                chip: language.nativeNameOf(own).slice(0, 2),
                chipLang: own,
                chevron: true,
                dividerBefore: true,
                onClick: () => router.push('/settings/profile'),
            });
        }
        return list;
    });

    function onSelect(code: string) {
        if (code !== language.activeLanguage) switchTo(code);
    }
</script>
