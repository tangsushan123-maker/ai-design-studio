import { listGeneratedImages } from "@/lib/generated-history";
import { getOpenAIConfig } from "@/lib/local-config";
import WorkbenchClient from "./workbench-client";

export default async function Page() {
  const history = await listGeneratedImages({ limit: 20, offset: 0 });
  const config = getOpenAIConfig();

  return (
    <WorkbenchClient
      initialImages={history.images}
      initialHistoryHasMore={history.hasMore}
      initialHistoryNextOffset={history.nextOffset}
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
