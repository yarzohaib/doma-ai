import { upsertProducts, initQdrantCollection } from './qdrant';
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
  await initQdrantCollection();

  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  const endpoint = process.env.NEXT_PUBLIC_PRODUCTS_ENDPOINT;

  console.log(`Fetching products from ${backendUrl}/${endpoint} ...`);

  const response = await fetch(`${backendUrl}/${endpoint}`);
  if (!response.ok) throw new Error(`Backend request failed: ${response.statusText}`);

  const data = await response.json();
  const backendProducts: BackendProduct[] = data.docs || [];

  console.log(`Fetched ${backendProducts.length} products`);

  const productsToIngest = await Promise.all(
    backendProducts.map(async (product, index) => {
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

  // Log imageUrl population rate so you can verify Cloudinary URLs are coming through
  const withImage = productsToIngest.filter(p => p.imageUrl).length;
  console.log(`📸 ${withImage}/${productsToIngest.length} products have an imageUrl`);

  await upsertProducts(productsToIngest);

  console.log(`✅ Successfully ingested ${productsToIngest.length} products to Qdrant`);
  return productsToIngest.length;
}
