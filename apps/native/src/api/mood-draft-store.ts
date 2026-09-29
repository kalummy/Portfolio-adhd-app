import { secureStorage } from '../auth/storage';
import { MoodDraftVault } from './mood-draft-vault';
export const nativeMoodDrafts = new MoodDraftVault(secureStorage);
