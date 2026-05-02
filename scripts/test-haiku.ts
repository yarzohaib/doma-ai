import { config } from 'dotenv';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

config({ path: path.join(process.cwd(), '.env.local') });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ Loaded' : '❌ Missing');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Reply with just: "Haiku is working"' }],
  });

  console.log('Response:', (response.content[0] as any).text);
}

main().catch(console.error);
