export * from '../../server/src/modules/live_session/types'

export interface LivePracticeSessionSetupType {
	aiCharacter: string;
	selectionMode: 'selection' | 'random';
	fromPhrase?: number;
	toPhrase?: number;
	totalPhrases?: number;
}