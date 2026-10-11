// Build-time feature flags, inlined by wxt.config.ts (see lib/features.ts).
interface ImportMetaEnv {
  readonly WXT_VOICE_LAB?: 'true' | 'false';
}
