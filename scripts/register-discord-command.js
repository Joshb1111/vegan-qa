// Run once to register the /ask slash command with Discord:
// node scripts/register-discord-command.js

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const command = {
  name: "ask",
  description: "Ask a question about veganism and abolitionist philosophy",
  options: [
    {
      name: "question",
      description: "What do you want to ask?",
      type: 3, // STRING
      required: true,
    },
    {
      name: "mode",
      description: "Answer length",
      type: 3, // STRING
      required: false,
      choices: [
        { name: "Detailed", value: "long" },
        { name: "Short", value: "short" },
      ],
    },
  ],
};

const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bot ${BOT_TOKEN}`,
  },
  body: JSON.stringify(command),
});

const data = await res.json();
console.log(res.ok ? "Command registered:" : "Error:", data);
