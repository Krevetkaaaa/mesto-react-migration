export const PUBLIC_CATALOG_DESCRIPTION =
  "Каталог опубликованных ресторанов, кафе, кофеен и баров Крыма в городском гиде «Место».";

export function publicCatalogLinks() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
    },
    { rel: "stylesheet", href: "/styles.css?v=auth-merchant-3" },
    { rel: "stylesheet", href: "/gastro-theme.css?v=premium-foundation-3" },
    { rel: "stylesheet", href: "/ambient-premium.css?v=premium-2" },
    { rel: "stylesheet", href: "/phone-premium.css?v=premium-1" },
    { rel: "stylesheet", href: "/editorial-sections.css?v=premium-2" },
  ];
}

export function publicCatalogHeaders() {
  return {
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    "X-Content-Type-Options": "nosniff",
  };
}
