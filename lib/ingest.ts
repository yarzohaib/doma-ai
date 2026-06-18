import { upsertProducts, resetCollection } from './qdrant';
import { generateEmbedding } from './embeddings';

interface ImageData {
  image: { url: string };
}

interface ColorData {
  id: string;
}

interface BackendProduct {
  id: string;
  title: string;
  slug: string;
  Description: string;
  pricing: { price: number; discountedPrice: number };
  colors: ColorData[];
  images: ImageData[];
  category: { name: string };
  vendor: { storeName: string };
  inventory?: { quantity: number; lowStockThreshold: number };
  status: string;
  featured: boolean;
  updatedAt: string;
  createdAt: string;
}

export async function ingestProductsFromBackend() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  const endpoint = process.env.NEXT_PUBLIC_PRODUCTS_ENDPOINT;

  console.log(`Fetching products from ${backendUrl}/${endpoint} ...`);

  // Fetch all pages to get every product (backend paginates by default)
  const backendProducts: BackendProduct[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const url = `${backendUrl}/${endpoint}?limit=100&page=${page}`;
    console.log(`  Fetching page ${page}: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Backend request failed (page ${page}): ${response.statusText}`);

    const data = await response.json();
    const docs: BackendProduct[] = data.docs || [];
    backendProducts.push(...docs);

    hasNextPage = data.hasNextPage ?? false;
    page++;
  }

  console.log(`Fetched ${backendProducts.length} products`);

  // Embed in small batches instead of all-at-once — HF's free inference API
  // times out under 100+ concurrent requests.
  const BATCH_SIZE = 10;
  const productsToIngest: Array<{ id: string | number; embedding: number[]; [key: string]: unknown }> = [];

  for (let i = 0; i < backendProducts.length; i += BATCH_SIZE) {
    const batch = backendProducts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (product, batchIndex) => {
        const index = i + batchIndex;
        const textToEmbed = [product.title, product.Description, product.category?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        console.log(`  Embedding ${index + 1}/${backendProducts.length}: ${product.title}`);
        const embedding = await generateEmbedding(textToEmbed);

        const firstImageUrl = product.images?.[0]?.image?.url ?? null;

        return {
          // ── Qdrant numeric ID ──────────────────────────────────────────────
          id: product.id,

          // ── Fields for inpainting (image generator) ────────────────────────
          name: product.title,
          description: product.Description,
          price: product.pricing?.price ?? null,
          category: product.category?.name ?? 'Uncategorized',
          imageUrl: firstImageUrl,       // Cloudinary URL → Claude Haiku vision
          productId: product.id,         // MongoDB doc ID → "View Product" link

          // ── Fields for RAG chatbot (preserved exactly as before) ───────────
          productName: product.title,
          productUrlSlug: product.slug,
          shortDescription: product.Description,
          pricingDetails: {
            originalPrice: product.pricing?.price ?? null,
            discountedPrice: product.pricing?.discountedPrice ?? null,
          },
          inventory: {
            availableQuantity: product.inventory?.quantity ?? 0,
            lowStockWarningAt: product.inventory?.lowStockThreshold ?? 5,
          },
          productImages: product.images?.map((img) => img.image?.url).filter(Boolean) ?? [],
          model3d: null,
          productStatus: product.status,
          markAsFeatured: product.featured ?? false,
          vendor: product.vendor?.storeName ?? 'Unknown',
          size: '',
          colors: product.colors?.map(() => 'Mixed') ?? [],
          updatedAt: product.updatedAt,
          createdAt: product.createdAt,

          embedding,
        };
      }),
    );
    productsToIngest.push(...batchResults);
  }

  // Log imageUrl population rate so you can verify Cloudinary URLs are coming through
  const withImage = productsToIngest.filter(p => p.imageUrl).length;
  console.log(`📸 ${withImage}/${productsToIngest.length} products have an imageUrl`);

  // Only wipe the old collection once the new data is ready to replace it,
  // so a mid-run failure never leaves Qdrant empty.
  await resetCollection();
  await upsertProducts(productsToIngest);

  console.log(`✅ Successfully ingested ${productsToIngest.length} products to Qdrant`);
  return productsToIngest.length;
}
