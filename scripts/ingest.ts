import { config } from 'dotenv';
import path from 'path';
import { ingestProductsFromBackend } from '../lib/ingest';

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), '.env.local') });

console.log('Environment check:');
console.log('  HUGGINGFACE_API_KEY:', process.env.HUGGINGFACE_API_KEY ? '✅' : '❌ Missing');
console.log('  QDRANT_URL:         ', process.env.QDRANT_URL          ? '✅' : '❌ Missing');
console.log('  QDRANT_API_KEY:     ', process.env.QDRANT_API_KEY      ? '✅' : '❌ Missing');
console.log('  NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL  ? '✅' : '❌ Missing');
console.log('');

async function main() {
  try {
    const count = await ingestProductsFromBackend();
    console.log(`\nDone — ingested ${count} products.`);
    process.exit(0);
  } catch (error) {
    console.error('\nIngestion failed:', error);
    process.exit(1);
  }
}

main();
