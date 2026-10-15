import { useLanguageStore } from '~/stores/language';

/**
 * Guards the language screens (Languages, Add a language, Chat test, Starter pack). While
 * multilingual is off they do not exist, so a stale link or a typed URL lands on Today
 * instead of an empty page. Runs after `auth`, which has already loaded the language state.
 */
export default defineNuxtRouteMiddleware(() => {
    const language = useLanguageStore();
    if (!language.enabled) return navigateTo('/board');
    return true;
});
