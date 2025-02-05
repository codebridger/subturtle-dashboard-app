import { type FileDocument } from "@modular-rest/client/dist/types/types";

export const DATABASE = {
  USER_CONTENT: "user_content",
};

export const COLLECTIONS = {
  PHRASE: "phrase",
  PHRASE_BUNDLE: "phrase_bundle",
  PROFILE: "profile",
};

export interface ProfileType {
  _id: string;
  refId: string;
  name: string;
  gPicture: string;
  images: FileDocument[];
}

export interface PhraseType {
  _id: string;
  refId: string;
  phrase: string;
  translation: string;
  translation_language: string;
  images?: FileDocument[];
}

export interface NewPhraseType {
  id: string;
  phrase: string;
  translation: string;
}

export interface PhraseBundleType {
  _id: string;
  refId: string;
  title: string;
  desc: string;
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
