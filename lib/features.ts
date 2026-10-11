// Build-time feature flags, resolved in wxt.config.ts (see featureFlag there) and inlined
// as 'true' / 'false'. They have no user-facing setting.

/** Voice lab on the options page: sample playback, voice audition and latency test. */
export const VOICE_LAB = import.meta.env.WXT_VOICE_LAB === 'true';
