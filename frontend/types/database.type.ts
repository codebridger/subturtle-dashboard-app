import { type FileDocument } from '@modular-rest/client/dist/types/types';
import { type PhraseSchema } from '../../server/src/modules/phrase_bundle/db';

export const DATABASE = {
    USER_CONTENT: 'user_content',
};

export const COLLECTIONS = {
    PHRASE: 'phrase',
    PHRASE_BUNDLE: 'phrase_bundle',
    PROFILE: 'profile',
    LIVE_SESSION: 'live_session',
};

export interface ProfileType {
    _id: string;
    refId: string;
    name: string;
    gPicture: string;
    images: FileDocument[];
}

export interface PhraseType extends PhraseSchema {
    _id: string;
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

import type { FreeCredit, Subscription } from '../../server/src/modules/subscription/types';

export interface SubscriptionType extends Subscription {
    label: string;
    portal_url: string;
    is_freemium: boolean;
}

export interface FreemiumAllocationType extends FreeCredit {
    is_freemium: true;
}
