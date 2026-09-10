-- Provisio / Freshline — product descriptions.
--
-- `products` never had a description column at all — the website's own
-- Add Product form already had a "Описание" textarea (placeholder "Origin,
-- quality grade, storage notes…"), but nothing wired it to a real column,
-- so every product silently discarded whatever was typed there. The app's
-- product detail screen only ever showed a generic templated fallback
-- built from vendor/unit (see Product.detailOrFallback) — never a real,
-- product-specific description.
alter table products add column if not exists description text;
comment on column products.description is
  'Short trade-copy blurb shown on the product detail screen; null/empty falls back to a generic templated description.';
