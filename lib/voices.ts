import type { LanguageCode, SarvamModel } from './sarvam';

// Sarvam has no voice-listing endpoint for stock voices, so these come from
// https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices (2026-10-10).

/** bulbul:v4-flash English (`_en_`) persona voices. */
export const V4_FLASH_EN_VOICES = [
  'aditi_en_stories', 'aparna_en_companion', 'aparna_en_edtech', 'ashwin_en_sports',
  'ashwin_en_sports_energetic', 'chandrika_en_stories', 'dev_en_recovery', 'dev_en_conversational',
  'deven_en_conversation', 'ishita_en_customer', 'ishita_en_medical', 'ishita_en_numbers',
  'ishita_en_social', 'ishita_en_stories', 'kalpit_en_edtech', 'nachiket_en_ads',
  'neha_en_customer', 'neha_en_latenight', 'nupur_en_kids', 'ojas_en_social', 'ritu_en_edtech',
  'ritu_en_latenight', 'ritu_en_medical', 'ritu_en_reels', 'rohan_en_recovery',
  'roopa_en_conversational', 'rustom_en_suspense', 'sanchita_en_companion',
  'sanchita_en_insurance', 'sanchita_en_recovery', 'sanchita_en_market', 'sanchita_en_social',
  'shabana_en_edtech', 'shalini_en_companion', 'shalini_en_customer', 'shubh_en_narration',
  'shubh_en_numbers', 'shubh_en_ads', 'shubh_en_recovery', 'shubh_en_audiobook',
  'shubh_en_narration_gentle', 'shubh_en_sports', 'simran_en_narration', 'simran_en_automobile',
  'simran_en_conversation', 'simran_en_customer', 'simran_en_edtech', 'simran_en_edtech_bot',
  'simran_en_sales', 'simran_en_recovery', 'simran_en_ads', 'simran_en_therapist',
  'sunny_en_social', 'varun_en_ads', 'varun_en_suspense', 'zarina_en_conversation',
  'amelia_en_conversational', 'sophia_en_conversational', 'girish_en_documentary',
  'girish_en_devotional', 'payal_en_edtech', 'sarang_en_narration',
] as const;

/** bulbul:v4-flash voices in the other languages (the lab only; reading stays English). */
const V4_FLASH_HI_VOICES = [
  'aayan_hi_conversational', 'amit_hi_conversational', 'ashutosh_hi_conversational',
  'kabir_hi_conversational', 'kavya_hi_conversational', 'manan_hi_conversational',
  'rahul_hi_conversational', 'sumit_hi_conversational', 'aditya_hi_conversational', 'aditya_hi_sales',
  'anand_hi_documentary', 'anand_hi_news', 'aparna_hi_customer', 'aparna_hi_kyc',
  'ashok_hi_character', 'ashok_hi_news', 'chhavi_hi_kids', 'ishita_hi_ads', 'ishita_hi_edtech',
  'ishita_hi_banking', 'ishita_hi_ads_informal', 'ishita_hi_devotional', 'ishita_hi_numbers',
  'ishita_hi_social', 'kunal_hi_kids', 'mahesh_hi_documentary', 'mani_hi_devotional',
  'mani_hi_conversational', 'mohit_hi_conversational', 'nachiket_hi_devotional', 'priya_hi_recovery',
  'ratan_hi_latenight', 'ratan_hi_customer_expressive', 'ratan_hi_documentary', 'ratan_hi_devotional',
  'ratan_hi_recovery', 'ratan_hi_social', 'ratan_hi_sports', 'ratan_hi_latenight_warm',
  'rehan_hi_social', 'ritu_hi_customer_utility', 'ritu_hi_kids', 'ritu_hi_conversation',
  'ritu_hi_customer', 'ritu_hi_edtech', 'ritu_hi_ads_formal', 'ritu_hi_banking',
  'ritu_hi_ads_informal', 'ritu_hi_insurance', 'ritu_hi_edtech_bot', 'ritu_hi_medical',
  'ritu_hi_sales', 'ritu_hi_reels', 'ritu_hi_social', 'ritu_hi_customer_warm',
  'ritu_hi_social_lively', 'roopa_hi_companion', 'roopa_hi_narration', 'roopa_hi_recovery',
  'roopa_hi_market', 'roopa_hi_conversational', 'sanchita_hi_assistant', 'sanchita_hi_edtech',
  'sanchita_hi_banking', 'sanchita_hi_feedback', 'sanchita_hi_ads_formal',
  'sanchita_hi_ads_informal', 'sanchita_hi_interview', 'sanchita_hi_romantic', 'sanchita_hi_market',
  'sanchita_hi_social', 'sanchita_hi_kyc', 'sarika_hi_conversation', 'shalini_hi_companion',
  'shalini_hi_social', 'shreya_hi_conversational', 'shreya_hi_news', 'shruti_hi_edtech',
  'shubh_hi_customer', 'shubh_hi_ecomm', 'shubh_hi_stories_mixed', 'shubh_hi_devotional',
  'shubh_hi_ads', 'shubh_hi_recovery', 'shubh_hi_stories_dramatic', 'simran_hi_assistant',
  'simran_hi_narration', 'simran_hi_automobile', 'simran_hi_conversation',
  'simran_hi_news_breaking', 'simran_hi_social_energetic', 'simran_hi_social_excited',
  'simran_hi_latenight', 'simran_hi_news', 'simran_hi_recovery', 'simran_hi_sales',
  'suchitra_hi_ecomm', 'suhani_hi_social', 'sunny_hi_ads', 'sunny_hi_reels',
  'tarun_hi_conversational', 'tarun_hi_sales', 'chaitra_hi_customer', 'shilpa_hi_narration',
  'tanya_hi_narration', 'aarti_hi_customer', 'advait_hi_character', 'aryaman_hi_ads',
  'chirag_hi_social', 'girish_hi_devotional', 'mukul_hi_ads', 'mukul_hi_suspense',
  'suman_hi_companion', 'vaibhav_hi_social', 'vandana_hi_ecomm', 'vipul_hi_social',
] as const;

/** Lab languages: the API's language codes, plus Hinglish for the code-mixed `_enhi_` voices. */
export type LabLanguage = 'en' | 'hi' | 'enhi' | 'bn' | 'gu' | 'kn' | 'ml' | 'mr' | 'od' | 'pa' | 'ta' | 'te';

export const LANGUAGES: Record<LabLanguage, { code: LanguageCode; name: string; native: string }> = {
  en: { code: 'en-IN', name: 'English', native: 'English' },
  hi: { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी' },
  // Sarvam doesn't document a code for the code-mixed voices; Hinglish text is sent as Hindi.
  enhi: { code: 'hi-IN', name: 'Hinglish', native: 'Hinglish' },
  bn: { code: 'bn-IN', name: 'Bengali', native: 'বাংলা' },
  gu: { code: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી' },
  kn: { code: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ' },
  ml: { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം' },
  mr: { code: 'mr-IN', name: 'Marathi', native: 'मराठी' },
  od: { code: 'od-IN', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  pa: { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ta: { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்' },
  te: { code: 'te-IN', name: 'Telugu', native: 'తెలుగు' },
};

/** bulbul:v4-flash personas by language. No Malayalam or Odia personas exist yet (v3 only). */
export const V4_FLASH_VOICES: Partial<Record<LabLanguage, readonly string[]>> = {
  en: V4_FLASH_EN_VOICES,
  hi: V4_FLASH_HI_VOICES,
  enhi: [
    'ishita_enhi_companion', 'ishita_enhi_customer', 'ishita_enhi_customer_expressive',
    'sanchita_enhi_companion', 'shalini_enhi_companion', 'shalini_enhi_customer',
    'shubh_enhi_companion', 'shubh_enhi_ads', 'shubh_enhi_banking', 'simran_enhi_companion',
    'simran_enhi_customer', 'simran_enhi_banking_expressive', 'sunny_enhi_customer',
  ],
  bn: ['bappa_bn_conversation', 'roopa_bn_conversational', 'bimal_bn_suspense'],
  gu: ['bhavik_gu_conversation', 'pooja_gu_conversational', 'pooja_gu_customer'],
  kn: ['chaitra_kn_conversation', 'chaitra_kn_narration', 'chetan_kn_conversation', 'suchitra_kn_narration'],
  mr: [
    'ishita_mr_conversational', 'mrunal_mr_narration', 'neha_mr_narration', 'nilesh_mr_conversation',
    'ritu_mr_insurance', 'ritu_mr_narration', 'rupali_mr_stories', 'soham_mr_narration', 'mukul_mr_stories',
  ],
  pa: ['anand_pa_conversation', 'anand_pa_customer', 'harpreet_pa_narration', 'jaspal_pa_banking'],
  ta: ['gokul_ta_narration', 'vetri_ta_ads', 'vetri_ta_suspense', 'vijay_ta_narration'],
  te: ['kavitha_te_conversation', 'kavitha_te_narration', 'pooja_te_conversation', 'tarun_te_narration'],
};

/** bulbul:v3 named speakers. Each is multilingual: it reads any of the 11 v3 language codes. */
export const V3_VOICES = [
  'shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya',
  'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir',
  'aayan', 'ashutosh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay',
  'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali',
] as const;

/** Voices whose style suggests long-form reading; audition these first. */
export const READING_SHORTLIST: Record<SarvamModel, readonly string[]> = {
  'bulbul:v4-flash': [
    'shubh_en_narration', 'shubh_en_audiobook', 'shubh_en_narration_gentle',
    'simran_en_narration', 'sarang_en_narration', 'girish_en_documentary',
    'aditi_en_stories', 'chandrika_en_stories', 'ishita_en_stories',
    'roopa_en_conversational', 'zarina_en_conversation', 'deven_en_conversation',
  ],
  'bulbul:v3': ['shubh', 'priya', 'aditya', 'ritu', 'kavya', 'rahul', 'simran', 'anand'],
};

/** Hindi has too many personas to audition them all; these suit long-form reading. */
const HI_READING_SHORTLIST = [
  'simran_hi_narration', 'roopa_hi_narration', 'shilpa_hi_narration', 'tanya_hi_narration',
  'anand_hi_documentary', 'mahesh_hi_documentary', 'ratan_hi_documentary', 'shreya_hi_news',
  'anand_hi_news', 'shubh_hi_stories_mixed', 'shubh_hi_stories_dramatic', 'aditya_hi_conversational',
];

export function labLanguages(model: SarvamModel): LabLanguage[] {
  const all = Object.keys(LANGUAGES) as LabLanguage[];
  return model === 'bulbul:v4-flash' ? all.filter((l) => V4_FLASH_VOICES[l]) : all.filter((l) => l !== 'enhi');
}

export function labVoices(model: SarvamModel, lang: LabLanguage): readonly string[] {
  return model === 'bulbul:v4-flash' ? (V4_FLASH_VOICES[lang] ?? []) : V3_VOICES;
}

/** Voices to audition for a language: the reading shortlist, or every persona when there are few. */
export function labShortlist(model: SarvamModel, lang: LabLanguage): readonly string[] {
  if (model === 'bulbul:v3' || lang === 'en') return READING_SHORTLIST[model];
  return lang === 'hi' ? HI_READING_SHORTLIST : labVoices(model, lang);
}

/**
 * The same speaker across languages: for v4-flash, that speaker's persona in each language that has
 * one (narration-style first); for v3, the speaker itself in every language.
 */
export function speakerAcrossLanguages(model: SarvamModel, voiceId: string): { lang: LabLanguage; voice: string }[] {
  const name = voiceId.split('_')[0]!;
  return labLanguages(model).flatMap((lang) => {
    if (model === 'bulbul:v3') return [{ lang, voice: name }];
    const own = labVoices(model, lang).filter((v) => v.startsWith(`${name}_${lang}_`));
    const voice = own.find((v) => /narration|stories|documentary|audiobook|conversation/.test(v)) ?? own[0];
    return voice ? [{ lang, voice }] : [];
  });
}

export function voicesFor(model: SarvamModel): readonly string[] {
  return model === 'bulbul:v4-flash' ? V4_FLASH_EN_VOICES : V3_VOICES;
}

export const DEFAULT_VOICE: Record<SarvamModel, string> = {
  'bulbul:v4-flash': 'shubh_en_narration',
  'bulbul:v3': 'shubh',
};

/** shubh_en_narration → "Shubh · narration" */
export function prettyVoice(id: string): string {
  const [name = id, , ...style] = id.split('_');
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return style.length ? `${cap} · ${style.join(' ')}` : cap;
}
