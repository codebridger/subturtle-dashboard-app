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

  function updateBundleDetail(
    id: string,
    update: Record<keyof PhraseBundleType, any>
  ) {
    return dataProvider
      .updateOne({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        query: {
          id,
          refId: authUser.value?.id,
        },
        update,
      })
      .then((_data) => {
        Object.keys(update).forEach((key: string, i) => {
          bundleDetail.value![key as keyof PhraseBundleType] =
            update[key as keyof PhraseBundleType];
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

  function updatePhrase(id: string, phrase: Record<keyof PhraseType, any>) {
    return dataProvider.updateOne({
      database: DATABASE.USER_CONTENT,
      collection: COLLECTIONS.PHRASE,
      query: {
        id,
        refId: authUser.value?.id,
      },
      update: phrase,
    });
  }

  return {
    bundleDetail,
    phrases,
    fetchBundleDetail,
    updateBundleDetail,
    phrasePagination,
    fetchPhrases,
    updatePhrase,
    clear,
  };
});
