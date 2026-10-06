// Which ElevenLabs voice each planet resident speaks with. Characters not listed here use the
// browser's built-in voice. Replace the IDs with the ones you pick in ElevenLabs (Voices → ⋯ → Copy voice ID).
export const VOICES = {
  // one voice per resident
  Mina: "uIcuMM41cZqo2iDgQbCW",
  Theo: "Wq15xSaY3gWvazBRaGEU",
  Ada: "TpWWQ1feZo6r95mPs1nf",
  Kofi: "T7TOOaZZ6tdlmJhBoEjH",
  June: "EQx6HGDYjkDpcli6vorJ",
  Ravi: "RBUtdrDRjER5aScqHwAS",
  Elin: "l006hw6wZaEYAv80cbzj",
  Sam: "hU1ratPhBTZNviWitzAh",
  Leslie: "goT3UYdM9bhm0n2lmKQx",
  // the Earthlings activists at the street protest (the planet sends n.voice when it is set, so this Sam doesn't borrow the forest Sam's voice)
  Jo: "MuZahdjQfGm43Kkfxdi8",
  Josh: "HAfx1Nwa3oT486RWo6Zc",
  "Sam the activist": "sVsUCT7L71Mt0k0ydAz3",
};
export const VOICE_MODEL = "eleven_flash_v2_5"; // cheapest model that still sounds natural
export const OUTPUT_FORMAT = "mp3_22050_32";    // small files: ~4 KB per second of speech
