import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/public-home.tsx"),
  route("help", "routes/public-help.tsx"),
  route("__react/health", "routes/react-health.tsx"),
] satisfies RouteConfig;
