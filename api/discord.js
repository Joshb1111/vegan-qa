import { InteractionType, InteractionResponseType } from 'discord-interactions';

export default async function handler(req, res) {
  // Discord sends a PING to verify the URL is working
  if (req.body.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  if (req.body.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = req.body.data;

    if (name === 'ask') {
      const userQuestion = options[0].value;
      
      // This is where the magic happens! 
      // For now, it will echo back your question.
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `You asked: **${userQuestion}** \n\nI'm currently connected! To give you a real vegan answer, we just need to hook up an AI key next.`,
        },
      });
    }
  }

  return res.status(400).json({ error: 'Unknown interaction' });
}