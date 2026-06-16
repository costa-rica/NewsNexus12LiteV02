import { createColumnHelper } from "@tanstack/react-table";

import { RatingCircle } from "@/components/tables/cells/RatingCircle";
import { ScrapedCell } from "@/components/tables/cells/ScrapedCell";
import { StateCell } from "@/components/tables/cells/StateCell";
import type { Article } from "@/state/types";

const columnHelper = createColumnHelper<Article>();

export const articleColumns = [
  columnHelper.accessor("title", {
    id: "title",
    header: "Title",
    cell: ({ getValue, row }) => {
      const title = getValue();
      const link = row.original.link;

      if (!link) {
        return <span>{title}</span>;
      }

      return (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
        >
          {title}
        </a>
      );
    },
  }),
  columnHelper.accessor("source", {
    id: "source",
    header: "News Source",
    cell: ({ getValue }) => <span>{getValue()}</span>,
  }),
  columnHelper.accessor("description", {
    id: "description",
    header: "Description",
    cell: ({ getValue }) => (
      <span className="line-clamp-3 text-gray-600 dark:text-gray-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("scrape", {
    id: "scraped",
    header: "Scraped",
    cell: ({ getValue }) => <ScrapedCell scrape={getValue()} />,
  }),
  columnHelper.accessor("locationRating", {
    id: "locationRating",
    header: "Nexus Location Rating",
    cell: ({ getValue }) => {
      const value = getValue();

      // null = skipped (no usable text) -> N/A; undefined = not yet run -> empty.
      if (value === null) {
        return (
          <span className="block text-center text-xs text-gray-400">N/A</span>
        );
      }

      return <RatingCircle score={value} ariaLabel="Nexus Location Rating" />;
    },
  }),
  columnHelper.accessor("stateAssignment", {
    id: "stateAssignment",
    header: "State (AI Assigned)",
    cell: ({ getValue }) => <StateCell assignment={getValue()} />,
  }),
  columnHelper.accessor("semanticRating", {
    id: "semanticRating",
    header: "Nexus Semantic Rating",
    cell: ({ getValue }) => (
      <RatingCircle
        score={getValue()}
        ariaLabel="Nexus Semantic Rating"
      />
    ),
  }),
];
