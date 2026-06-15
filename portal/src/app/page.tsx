import { FlowIndicatorBar } from "@/components/layout/FlowIndicatorBar";
import { SlideStage } from "@/components/layout/SlideStage";
import { TopBar } from "@/components/layout/TopBar";
import { StageActionArea } from "@/components/search/StageActionArea";
import { ArticlesTable } from "@/components/tables/ArticlesTable";

export default function HomePage() {
  return (
    <SlideStage>
      <TopBar />
      <FlowIndicatorBar />
      <StageActionArea />
      <ArticlesTable />
    </SlideStage>
  );
}
