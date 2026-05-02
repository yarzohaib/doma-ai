import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/${process.env.NEXT_PUBLIC_PRODUCTS_ENDPOINT}?limit=1`;
  console.log('Fetching:', url);

  const res = await fetch(url);
  const data = await res.json();
  const product = data.docs?.[0];

  if (!product) {
    console.log('No products returned');
    return;
  }

  console.log('\n--- Full first product ---');
  console.log(JSON.stringify(product, null, 2));

  console.log('\n--- images field specifically ---');
  console.log(JSON.stringify(product.images, null, 2));
}

main().catch(console.error);
