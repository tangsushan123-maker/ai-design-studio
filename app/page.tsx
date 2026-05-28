import { getCurrentUser } from "@/lib/auth";
import { getOpenAIConfig } from "@/lib/local-config";
import { runWithConfigUser } from "@/lib/local-config";
import WorkbenchClient from "./workbench-client";

export default async function Page() {
  const user = await getCurrentUser();
  const config = runWithConfigUser(user, () => getOpenAIConfig());

  return (
    <WorkbenchClient
      initialImages={[]}
      initialHistoryHasMore={false}
      initialHistoryNextOffset={0}
      initialModelInfo={{
        imageModel: config.imageModel,
        analysisModel: config.analysisModel,
        textModel: config.textModel,
        videoModel: config.videoModel,
        modelsCache: config.modelsCache,
        providerLabel: config.providerLabel,
        hasKey: config.hasApiKey,
      }}
    />
  );
}
