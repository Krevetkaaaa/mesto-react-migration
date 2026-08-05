import type { Route } from "./+types/react-health";

export const HEALTH_PAYLOAD = Object.freeze({
  service: "mesto-react",
  status: "ok",
} as const);

export function meta() {
  return [
    { title: "Mesto React health" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export function loader() {
  return Response.json(HEALTH_PAYLOAD, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export function ReactHealthView({
  payload,
}: {
  payload: typeof HEALTH_PAYLOAD;
}) {
  return (
    <main data-react-health={payload.status}>
      <h1>React foundation работает</h1>
      <p>
        Сервис <code>{payload.service}</code>: <strong>{payload.status}</strong>
      </p>
    </main>
  );
}

export default function ReactHealth({ loaderData }: Route.ComponentProps) {
  return <ReactHealthView payload={loaderData} />;
}
