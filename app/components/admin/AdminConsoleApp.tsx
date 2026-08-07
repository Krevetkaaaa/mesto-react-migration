import { useActionData, useLocation } from "react-router";

import type { AdminActionData, AdminLoaderData } from "../../modules/admin-console.server";
import { AdminLogin } from "./AdminLogin";
import { AdminWorkspace } from "./AdminWorkspace";
import { adminViews, type AdminView } from "./admin-ui";

export interface AdminConsoleAppProps {
  loaderData: AdminLoaderData;
}

function routeView(pathname: string): AdminView {
  const candidate = pathname.split("/").filter(Boolean)[1];
  return adminViews.has(candidate as AdminView) ? candidate as AdminView : "overview";
}

export function AdminConsoleApp({ loaderData }: AdminConsoleAppProps) {
  const location = useLocation();
  const actionData = useActionData<AdminActionData>();

  if (loaderData.status !== "ready") {
    return (
      <AdminLogin
        unavailable={loaderData.status === "unavailable"}
        message={actionData?.intent === "admin.login" && !actionData.ok
          ? actionData.message
          : loaderData.message}
      />
    );
  }

  return (
    <AdminWorkspace
      workspace={loaderData.workspace}
      activeView={routeView(location.pathname)}
      routeActionData={actionData}
    />
  );
}

export default AdminConsoleApp;
