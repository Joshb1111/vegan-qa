// Which ElevenLabs voice each planet resident speaks with. Characters not listed here use the
// browser's built-in voice. Replace the IDs with the ones you pick in ElevenLabs (Voices → ⋯ → Copy voice ID).
export const VOICES = {
  // male residents — Josh's chosen voices
  Theo: "UmQN7jS1Ee8B1czsUtQh",
  Kofi: "KYq5lC0WZo5uHYKcpjGC",
  Ravi: "KYq5lC0WZo5uHYKcpjGC",
  Sam:  "KYq5lC0WZo5uHYKcpjGC",
  // female residents — add IDs here when chosen: Mina, Ada, June, Elin
};
export const VOICE_MODEL = "eleven_flash_v2_5"; // cheapest model that still sounds natural
export const OUTPUT_FORMAT = "mp3_22050_32";    // small files: ~4 KB per second of speech
