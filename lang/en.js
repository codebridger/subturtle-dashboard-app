// Structure of the:
// https://i18n.nuxtjs.org/docs/guide/lazy-load-translations
//
export default {
  // components
  comp: {
    bundle: {
      add_new: {
        title_placeholder: "My new Tiny set",
        title_required: "Title is required",
        duplicate_title: "Title already exists",
        duplicate_title_desc: "Please choose another title",
        desc_max: "Description is too long",
        desc_placeholder: "Description",
        error: "Failed to create new bundle",
        title: "Add new bundle",
        action_add_new: "Add new bundle",
        action_cancel: "Cancel",
        action_create: "Create",
      },
      detail_card: {
        submit: "Submit",
        title_required: "Title is required",
      },
      phrase_card: {
        phrase_placeholder: "Type your phrase here",
        translation_placeholder: "Type your translation here",
      },
    },
  },
  page: {
    dashboard: {
      nav: "Dashboard",
      recent: "Recent",
      "quick-states": {
        label: "Your quick stats",
        "total-phrases": "Phrases",
        "total-bundles": "Bundles",
      },
    },
    "dashboard-bundle": {
      nav: "Phrase Bundles",
    },
  },
  "flashcard-tool": {
    label: "Flashcards",
    tooltip: "Memorize this bundle of flashcards",
  },
  "match-tool": {
    label: "Match",
    tooltip: "Practice this bundle trough matching game",
  },
  "learn-tool": {
    label: "Learn",
    tooltip: "Learn this bundle of phrases by Artificial Intelligence",
  },
};
