import { useActionData, useLocation } from "react-router";

import type {
  MerchantActionData,
  MerchantLoaderData,
} from "../../modules/merchant-workspace.server";
import { MerchantLogin } from "./MerchantLogin";
import { MerchantWorkspace } from "./MerchantWorkspace";
import type { MerchantView } from "./merchant-ui";

export interface MerchantWorkspaceAppProps {
  loaderData: MerchantLoaderData;
}

const merchantViews = new Set<MerchantView>(["overview", "venue", "menu", "promotions", "reviews"]);

function routeView(pathname: string): MerchantView {
  const candidate = pathname.split("/").filter(Boolean)[1];
  return merchantViews.has(candidate as MerchantView) ? candidate as MerchantView : "overview";
}

export function MerchantWorkspaceApp({ loaderData }: MerchantWorkspaceAppProps) {
  const location = useLocation();
  const actionData = useActionData<MerchantActionData>();

  if (loaderData.status !== "ready") {
    return (
      <MerchantLogin
        action="/merchant"
        unavailable={loaderData.status === "unavailable"}
        message={actionData?.intent === "merchant.login" && !actionData.ok
          ? actionData.message
          : loaderData.message}
      />
    );
  }

  return (
    <MerchantWorkspace
      workspace={loaderData.workspace}
      activeView={routeView(location.pathname)}
      action="/merchant"
      now={loaderData.loadedAt}
    />
  );
}

export default MerchantWorkspaceApp;
