// Which ElevenLabs voice each planet resident speaks with. Characters not listed here use the
// browser's built-in voice. Replace the IDs with the ones you pick in ElevenLabs (Voices → ⋯ → Copy voice ID).
export const VOICES = {
  // male residents — placeholder: ElevenLabs' stock "Daniel" until Josh's chosen voice ID goes in
  Theo: "onwK4e9ZLuTAKqWW03F9",
  Kofi: "onwK4e9ZLuTAKqWW03F9",
  Ravi: "onwK4e9ZLuTAKqWW03F9",
  Sam:  "onwK4e9ZLuTAKqWW03F9",
  // female residents — add IDs here when chosen: Mina, Ada, June, Elin
};
export const VOICE_MODEL = "eleven_flash_v2_5"; // cheapest model that still sounds natural
export const OUTPUT_FORMAT = "mp3_22050_32";    // small files: ~4 KB per second of speech
