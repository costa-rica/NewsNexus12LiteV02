"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type { Article } from "@/state/types";
import { useFlow } from "@/state/FlowContext";

import { articleColumns } from "./columns";

interface ArticlesTableProps {
  articles?: Article[];
}

export function ArticlesTable({ articles }: ArticlesTableProps) {
  const { state } = useFlow();
  const data = articles ?? state.articles;

  // TanStack Table is the required table engine for this portal shell.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: articleColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <section
      data-testid="articles-table-region"
      className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8"
      aria-label="Article table"
    >
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white/80 shadow-theme-md backdrop-blur dark:border-white/10 dark:bg-gray-950/55">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed">
            <thead className="bg-gray-50 text-left dark:bg-gray-900/70">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/60"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-4 align-top text-sm text-gray-800 dark:text-gray-200"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={articleColumns.length}
                    className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No articles yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
