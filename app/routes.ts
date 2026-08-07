import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/public-home.tsx"),
  route("help", "routes/public-help.tsx"),
  route("catalog", "routes/public-catalog.tsx"),
  route("city/:citySlug", "routes/public-city.tsx"),
  route("venue/:venueSlug", "routes/public-venue.tsx"),
  route("login", "routes/public-login.tsx"),
  route("register", "routes/public-register.tsx"),
  route("profile", "routes/public-profile.tsx"),
  route("favorites", "routes/public-favorites.tsx"),
  route("merchant", "routes/merchant-layout.tsx", [
    index("routes/merchant-index.tsx"),
    route(":view", "routes/merchant-view.tsx"),
  ]),
  route("admin", "routes/admin-layout.tsx", [
    index("routes/admin-index.tsx"),
    route(":view", "routes/admin-view.tsx"),
  ]),
  route("__react/health", "routes/react-health.tsx"),
] satisfies RouteConfig;
