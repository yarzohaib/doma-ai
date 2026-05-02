"use client";

import { useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string | number;
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  color?: string;
  material?: string;
  imageUrl?: string | null;
  productId?: string | null;
  score?: number;
}

interface MatchResult {
  item: string;
  product: Product | null;
}

interface RedesignResult {
  output: string;
  matchedProducts: MatchResult[];
  style: string;
  roomItems: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLES = [
  { id: "modern",       label: "Modern" },
  { id: "minimalist",   label: "Minimalist" },
  { id: "bohemian",     label: "Bohemian" },
  { id: "scandinavian", label: "Scandinavian" },
  { id: "industrial",   label: "Industrial" },
  { id: "contemporary", label: "Contemporary" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function UploadZone({
  image,
  onImage,
  disabled,
}: {
  image: string | null;
  onImage: (base64: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: image ? undefined : "16/9",
        minHeight: image ? undefined : 220,
        background: image ? "transparent" : "#0f172a",
        border: image ? "none" : "2px dashed rgba(255,255,255,0.12)",
        borderRadius: 16,
        cursor: disabled ? "default" : "pointer",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color 0.2s",
      }}
    >
      {image ? (
        <img
          src={image}
          alt="Uploaded room"
          style={{ width: "100%", borderRadius: 16, display: "block" }}
        />
      ) : (
        <div style={{ textAlign: "center", color: "#475569", userSelect: "none" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🏠</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>
            Drop a room photo here
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>or click to browse</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

function StylePill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 18px",
        borderRadius: 999,
        border: selected ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
        background: selected
          ? "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)"
          : "rgba(255,255,255,0.04)",
        color: selected ? "#fff" : "#94a3b8",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s",
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </button>
  );
}

function ProductCard({ item, product }: { item: string; product: Product }) {
  const buyUrl = product.productId
    ? `https://doma-backend.onrender.com/api/public-products/${product.productId}`
    : null;

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", aspectRatio: "4/3", background: "#1e293b" }}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name ?? item}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              color: "#334155",
            }}
          >
            🛋
          </div>
        )}
        {/* DOMA badge */}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: "rgba(37,99,235,0.85)",
            backdropFilter: "blur(4px)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 6,
          }}
        >
          DOMA
        </span>
        {/* Item category label */}
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            color: "#cbd5e1",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "capitalize",
            padding: "3px 8px",
            borderRadius: 6,
          }}
        >
          {item}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: "#f1f5f9",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.name ?? "Product"}
        </p>

        {/* Tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {product.color && (
            <Tag>{product.color}</Tag>
          )}
          {product.material && (
            <Tag>{product.material}</Tag>
          )}
          {product.score !== undefined && (
            <Tag accent>{(product.score * 100).toFixed(0)}% match</Tag>
          )}
        </div>

        {/* Price + CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: 8,
          }}
        >
          {product.price !== undefined ? (
            <span style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9" }}>
              Rs. {product.price.toLocaleString()}
            </span>
          ) : (
            <span />
          )}
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                padding: "7px 14px",
                borderRadius: 999,
                textDecoration: "none",
                boxShadow: "0 3px 10px rgba(37,99,235,0.3)",
              }}
            >
              Shop
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 5,
        background: accent ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.06)",
        color: accent ? "#93c5fd" : "#94a3b8",
        border: accent ? "1px solid rgba(37,99,235,0.3)" : "1px solid rgba(255,255,255,0.07)",
        textTransform: "capitalize",
      }}
    >
      {children}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Page() {
  const [image, setImage] = useState<string | null>(null);
  const [style, setStyle] = useState("modern");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedesignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!image) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/redesign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, style, prompt: prompt.trim() || undefined }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }

      const data: RedesignResult = await res.json();
      if (!data.output) throw new Error("No image returned");
      setResult(data);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const catalogMatches = result?.matchedProducts.filter(r => r.product !== null) ?? [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#f1f5f9",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              margin: "0 0 10px",
              background: "linear-gradient(135deg, #f1f5f9 30%, #64748b 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Room Redesign
          </h1>
          <p style={{ color: "#64748b", fontSize: 15, margin: 0, lineHeight: 1.6 }}>
            Upload a room photo, pick a style — DOMA redesigns it with real catalog products and lets you shop the look.
          </p>
        </div>

        {/* Upload + controls */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <UploadZone image={image} onImage={setImage} disabled={loading} />

          {image && (
            <button
              onClick={() => { setImage(null); setResult(null); setError(null); }}
              style={{
                marginTop: 10,
                background: "none",
                border: "none",
                color: "#475569",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Remove photo
            </button>
          )}

          {/* Style selector */}
          <div style={{ marginTop: 24 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Style
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STYLES.map(s => (
                <StylePill
                  key={s.id}
                  label={s.label}
                  selected={style === s.id}
                  onClick={() => setStyle(s.id)}
                />
              ))}
            </div>
          </div>

          {/* Optional prompt */}
          <div style={{ marginTop: 24 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Custom prompt <span style={{ color: "#334155", fontWeight: 400, textTransform: "none" }}>(optional)</span>
            </p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={loading}
              placeholder="e.g. add a fireplace, warm lighting, large windows with a garden view…"
              rows={3}
              style={{
                width: "100%",
                background: "#020617",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "12px 14px",
                color: "#f1f5f9",
                fontSize: 14,
                lineHeight: 1.5,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!image || loading}
            style={{
              marginTop: 24,
              width: "100%",
              padding: "14px 0",
              borderRadius: 12,
              border: "none",
              background:
                !image || loading
                  ? "rgba(255,255,255,0.06)"
                  : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              color: !image || loading ? "#475569" : "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: !image || loading ? "not-allowed" : "pointer",
              letterSpacing: "0.02em",
              transition: "all 0.15s",
              boxShadow: !image || loading ? "none" : "0 4px 20px rgba(37,99,235,0.35)",
            }}
          >
            {loading ? "Redesigning your room…" : "Redesign Room"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 12,
              padding: "14px 18px",
              color: "#fca5a5",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Before / After */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <Label>Before</Label>
                <img
                  src={image!}
                  alt="Original"
                  style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", display: "block" }}
                />
              </div>
              <div>
                <Label>
                  After ·{" "}
                  <span style={{ textTransform: "capitalize", color: "#93c5fd" }}>
                    {result.style}
                  </span>
                </Label>
                <img
                  src={result.output}
                  alt="Redesigned room"
                  style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", display: "block" }}
                />
              </div>
            </div>

            {/* Shop This Room */}
            {catalogMatches.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#f1f5f9",
                      margin: 0,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Shop This Room
                  </h2>
                  <span
                    style={{
                      background: "rgba(37,99,235,0.15)",
                      border: "1px solid rgba(37,99,235,0.3)",
                      color: "#93c5fd",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {catalogMatches.length} DOMA products used
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "#475569", marginBottom: 20, marginTop: 0 }}>
                  These products from the DOMA catalog were used to style your room. Click Shop to purchase.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 16,
                  }}
                >
                  {catalogMatches.map(({ item, product }) => (
                    <ProductCard key={item} item={item} product={product!} />
                  ))}
                </div>
              </div>
            )}

            {/* Items with no catalog match */}
            {result.matchedProducts.some(r => r.product === null) && (
              <p style={{ fontSize: 12, color: "#334155", textAlign: "center" }}>
                Some items in this room (
                {result.matchedProducts.filter(r => r.product === null).map(r => r.item).join(", ")}
                ) were styled by AI — not yet in the DOMA catalog.
              </p>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#475569",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  );
}
