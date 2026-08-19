import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  serverModuleFormat: "cjs",
  routeDiscovery: { mode: "initial" },
  presets: [vercelPreset()],
} satisfies Config;
