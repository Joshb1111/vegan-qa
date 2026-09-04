// Which ElevenLabs voice each planet resident speaks with. Characters not listed here use the
// browser's built-in voice. Replace the IDs with the ones you pick in ElevenLabs (Voices → ⋯ → Copy voice ID).
export const VOICES = {
  // one voice per resident (Ada keeps the shared voice until she has her own)
  Mina: "uIcuMM41cZqo2iDgQbCW",
  Theo: "Wq15xSaY3gWvazBRaGEU",
  Ada: "85o4S4rAEvTIDGtpFNUq",
  Kofi: "HM2kjmxf584DyZCsWcSg",
  June: "EQx6HGDYjkDpcli6vorJ",
  Ravi: "RBUtdrDRjER5aScqHwAS",
  Elin: "l006hw6wZaEYAv80cbzj",
  Sam: "lzEcwxMugQa5xHIYqLZA",
};
export const VOICE_MODEL = "eleven_flash_v2_5"; // cheapest model that still sounds natural
export const OUTPUT_FORMAT = "mp3_22050_32";    // small files: ~4 KB per second of speech
