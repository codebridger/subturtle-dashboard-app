import { createPagination, dataProvider } from "@modular-rest/client";
import type { PaginationType } from "@modular-rest/client/dist/types/data-provider";
import { defineStore } from "pinia";
import {
  type PhraseBundleType,
  DATABASE,
  COLLECTIONS,
  type PhraseType,
} from "~/types/database.type";

export const useBundleStore = defineStore("bundle", () => {
  const bundleDetail = ref<PhraseBundleType | null>(null);

  const phrasePagination = ref<PaginationType | null>(null);

  const phrases = ref<PhraseType[]>([]);
  const PhrasesPerPage = 50;

  function clear() {
    bundleDetail.value = null;
    phrasePagination.value = null;
    phrases.value = [];
  }

  function getPhraseNumber(phraseId: string) {
    let index =
      bundleDetail.value?.phrases.findIndex((id) => id === phraseId) || 0;
    return (bundleDetail.value?.phrases?.length ?? 0) - index;
  }

  function fetchBundleDetail(id: string) {
    clear();

    return dataProvider
      .findByIds<PhraseBundleType>({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        ids: [id],
        accessQuery: {
          refId: authUser.value?.id,
        },
      })
      .then((data) => {
        bundleDetail.value = data[0];
        bundleDetail.value.phrases = data[0].phrases.reverse();

        phrasePagination.value = createPagination(
          bundleDetail.value?.phrases?.length || 0,
          PhrasesPerPage,
          1
        );
      });
  }

  function updateBundleDetail(id: string, updated: { [key: string]: any }) {
    return dataProvider
      .updateOne({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        query: {
          _id: id,
          refId: authUser.value?.id,
        },
        update: updated,
      })
      .then((_data) => {
        Object.keys(updated).forEach((key: string, i) => {
          bundleDetail.value![key as keyof PhraseBundleType] =
            updated[key as keyof PhraseBundleType];
        });
      });
  }

  function fetchPhrases(page: number) {
    if (page > (phrasePagination.value?.pages ?? 0)) {
      return Promise.resolve();
    }
    phrases.value = [];

    phrasePagination.value = createPagination(
      bundleDetail.value?.phrases?.length || 0,
      PhrasesPerPage,
      page
    );

    const start = (page - 1) * phrasePagination.value.limit;
    const end = start + phrasePagination.value.limit;
    const phrasesIds = bundleDetail.value?.phrases?.slice(start, end) || [];

    return dataProvider
      .findByIds<PhraseType>({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE,
        ids: phrasesIds,
        accessQuery: {
          refId: authUser.value?.id,
        },
      })
      .then((data) => {
        phrases.value = data.reverse();
      });
  }

  function updatePhrase(id: string, updated: { [key: string]: any }) {
    return dataProvider
      .updateOne({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE,
        query: {
          _id: id,
          refId: authUser.value?.id,
        },
        update: updated,
      })
      .then((_data) => {
        const index = phrases.value.findIndex((p) => p._id === id);
        Object.keys(updated).forEach((key: string, i) => {
          phrases.value[index][key as keyof PhraseType] =
            updated[key as keyof PhraseType];
        });
      });
  }

  function removePhrase(id: string) {
    return dataProvider
      .updateOne({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        query: {
          _id: bundleDetail.value?._id,
          refId: authUser.value?.id,
        },
        update: {
          $pull: { phrases: id },
        },
      })
      .then((_data) => {
        const index = phrases.value.findIndex((p) => p._id === id);
        phrases.value.splice(index, 1);
      });
  }

  return {
    bundleDetail,
    phrases,
    fetchBundleDetail,
    updateBundleDetail,
    phrasePagination,
    getPhraseNumber,
    fetchPhrases,
    updatePhrase,
    removePhrase,
    clear,
  };
});
