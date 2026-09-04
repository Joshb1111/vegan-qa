// Which ElevenLabs voice each planet resident speaks with. Characters not listed here use the
// browser's built-in voice. Replace the IDs with the ones you pick in ElevenLabs (Voices → ⋯ → Copy voice ID).
export const VOICES = {
  // everyone on Josh's chosen voice for now; give the women their own IDs here when chosen
  Theo: "85o4S4rAEvTIDGtpFNUq", Kofi: "85o4S4rAEvTIDGtpFNUq", Ravi: "85o4S4rAEvTIDGtpFNUq", Sam: "85o4S4rAEvTIDGtpFNUq",
  Mina: "85o4S4rAEvTIDGtpFNUq", Ada: "85o4S4rAEvTIDGtpFNUq", June: "85o4S4rAEvTIDGtpFNUq", Elin: "85o4S4rAEvTIDGtpFNUq",
};
export const VOICE_MODEL = "eleven_flash_v2_5"; // cheapest model that still sounds natural
export const OUTPUT_FORMAT = "mp3_22050_32";    // small files: ~4 KB per second of speech
