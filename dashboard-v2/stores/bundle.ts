import { createPagination, dataProvider } from "@modular-rest/client";
import type { PaginationType } from "@modular-rest/client/dist/types/data-provider";
import { defineStore } from "pinia";
import {
  type PhraseBundleType,
  DATABASE,
  COLLECTIONS,
  type PhraseType,
  type NewPhraseType,
} from "~/types/database.type";

export const useBundleStore = defineStore("bundle", () => {
  const bundleDetail = ref<PhraseBundleType | null>(null);

  const phrasePagination = ref<PaginationType | null>(null);

  const tempPhrases = ref<Array<NewPhraseType>>([]);
  const phrases = ref<Array<PhraseType>>([]);
  const PhrasesPerPage = 500;

  function clear() {
    bundleDetail.value = null;
    phrasePagination.value = null;
    phrases.value = [];
    tempPhrases.value = [];
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

  function addEmptyTemporarilyPhrase() {
    tempPhrases.value.unshift({
      phrase: "",
      translation: "",
      id: new Date().getTime().toString(),
    });
  }

  function removeTemporarilyPhrase(id: string) {
    tempPhrases.value = tempPhrases.value.filter((p) => p.id !== id);
  }

  async function createPhrase(newPhrase: NewPhraseType) {
    const index = tempPhrases.value.findIndex((p) => p.id === newPhrase.id);
    tempPhrases.value = tempPhrases.value.filter((p) => p.id !== newPhrase.id);

    const newDoc = {
      ...newPhrase,
      refId: authUser.value?.id,
    } as { [ket: string]: any };

    delete newDoc["id"];

    return new Promise<PhraseType>(async (resolve, reject) => {
      // Insert new phrase
      const insertedPhrase = await dataProvider
        .insertOne({
          database: DATABASE.USER_CONTENT,
          collection: COLLECTIONS.PHRASE,
          doc: newDoc,
        })
        .catch(reject);

      if (!insertedPhrase) return;

      // Update phrase bundle
      await dataProvider
        .updateOne({
          database: DATABASE.USER_CONTENT,
          collection: COLLECTIONS.PHRASE_BUNDLE,
          query: {
            _id: bundleDetail.value?._id,
            refId: authUser.value?.id,
          },
          update: {
            $push: { phrases: insertedPhrase._id },
          },
        })
        .then(() => resolve(insertedPhrase))
        .catch(reject);
    })
      .then((insertedPhrase) => {
        bundleDetail.value?.phrases.unshift(insertedPhrase._id);
        phrases.value.unshift(insertedPhrase);
      })
      .catch((error) => {
        // add back the phrase if there is an error
        tempPhrases.value.splice(index, 0, newPhrase);
      });
  }

  return {
    bundleDetail,
    phrases,
    tempPhrases,
    fetchBundleDetail,
    updateBundleDetail,
    phrasePagination,
    getPhraseNumber,
    fetchPhrases,
    updatePhrase,
    removePhrase,
    addEmptyTemporarilyPhrase,
    removeTemporarilyPhrase,
    createPhrase,
    clear,
  };
});
