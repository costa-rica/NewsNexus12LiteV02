import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { SlideStage } from "@/components/layout/SlideStage";
import { StatePromptEditorSlot } from "@/components/state/StatePromptEditor";
import { TopBar } from "@/components/layout/TopBar";
import { StageActionArea } from "@/components/search/StageActionArea";
import { ArticlesTable } from "@/components/tables/ArticlesTable";
import { SemanticKeywordEditorSlot } from "@/components/semantic/SemanticKeywordEditor";

export default function HomePage() {
  return (
    <SlideStage>
      <TopBar />
      <FlowIndicatorBar />
      <StageActionArea />
      <ArticlesTable />
      <StatePromptEditorSlot />
      <SemanticKeywordEditorSlot />
    </SlideStage>
  );
}
