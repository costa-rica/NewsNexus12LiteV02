import { FlowIndicator } from "@/components/layout/FlowIndicator";
import { SlideStage } from "@/components/layout/SlideStage";
import { TopBar } from "@/components/layout/TopBar";
import { ArticlesTable } from "@/components/tables/ArticlesTable";

export default function HomePage() {
  return (
    <SlideStage>
      <TopBar />
      <FlowIndicator />
      <ArticlesTable />
    </SlideStage>
  );
}
