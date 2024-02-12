import { type FileDocument } from "@modular-rest/client/dist/types/types";

export const DATABASE = {
  USER_CONTENT: "user_content",
};

export const COLLECTIONS = {
  PHRASE: "phrase",
  PHRASE_BUNDLE: "phrase_bundle",
};

export interface PhraseType {
  _id: string;
  refId: string;
  phrase: string;
  translation: string;
  translation_language: string;
  images?: FileDocument[];
}

export interface PhraseBundleType {
  _id: string;
  refId: string;
  title: string;
  image: FileDocument[];
  phrases: string[];
}

export interface PopulatedPhraseBundleType {
  _id: string;
  refId: string;
  title: string;
  image: FileDocument[];
  phrases: PhraseType[];
}
