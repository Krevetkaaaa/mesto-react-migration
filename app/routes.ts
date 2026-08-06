import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/public-home.tsx"),
  route("help", "routes/public-help.tsx"),
  route("catalog", "routes/public-catalog.tsx"),
  route("city/:citySlug", "routes/public-city.tsx"),
  route("venue/:venueSlug", "routes/public-venue.tsx"),
  route("__react/health", "routes/react-health.tsx"),
] satisfies RouteConfig;
