import { type FileDocument } from '@modular-rest/client/dist/types/types';
import { type PhraseSchema, type LinguisticData } from '../../server/src/modules/phrase_bundle/db';

export const DATABASE = {
    USER_CONTENT: 'user_content',
    LEITNER: 'subturtle_leitner',
    BOARD: 'subturtle_board',
};

export const COLLECTIONS = {
    PHRASE: 'phrase',
    PHRASE_BUNDLE: 'phrase_bundle',
    PROFILE: 'profile',
    LIVE_SESSION: 'live_session',
    LEITNER_SYSTEM: 'leitner_system',
    BOARD_ACTIVITY: 'board_activity',
};

// Re-export LinguisticData type for frontend use
export type { LinguisticData };

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

// Leitner & Board Types
export interface BoardActivityType {
    _id: string;
    user: string;
    type: string;
    toastType: 'singleton' | 'unique';
    refId?: string;
    state: 'idle' | 'toasted';
    persistent: boolean;
    lastUpdated: string; // Dates often come as strings from JSON
    meta: any;
}

export interface LeitnerItemType {
    phraseId: string | PhraseType;
    boxLevel: number;
    nextReviewDate: string;
    lastAttemptDate: string;
    consecutiveIncorrect: number;
    phrase?: PhraseType; // Populated
}

// Override or extend DATABASE/COLLECTIONS
export const DATABASE_EXT = {
    ...DATABASE,
    LEITNER: 'subturtle_leitner',
    BOARD: 'subturtle_board'
};

export const COLLECTIONS_EXT = {
    ...COLLECTIONS,
    LEITNER_SYSTEM: 'leitner_system',
    BOARD_ACTIVITY: 'board_activity'
};
