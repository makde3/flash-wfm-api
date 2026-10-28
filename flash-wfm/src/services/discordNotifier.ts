const WEBHOOK_URL = process.env.EXPO_PUBLIC_DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1565030016209657946/YmUHsck5CfLU-wtRHfTgk52mckhESQYBIyIoPYzMUOoLoIOPBII23OVOvsqtES02X1fR';

const COULEURS = {
  login: 0x22c55e,
  feedback: 0x3b82f6,
} as const;

export async function sendDiscordNotif(title: string, message: string, type: 'login' | 'feedback'): Promise<void> {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description: message,
            color: COULEURS[type],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {
    // Une panne Discord ne doit pas bloquer la connexion ni le feedback.
  }
}
