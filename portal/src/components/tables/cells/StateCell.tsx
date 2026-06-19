import type { StateAssignment } from "@/state/types";

export interface StateCellProps {
  assignment?: StateAssignment;
  onOpen?: (assignment: StateAssignment) => void;
}

export function StateCell({ assignment, onOpen }: StateCellProps) {
  if (!assignment) {
    return null;
  }

  if (assignment.resultStatus === "assigned") {
    const label = assignment.stateName?.trim();

    if (!label) {
      return null;
    }

    if (onOpen) {
      return (
        <button
          type="button"
          onClick={() => onOpen(assignment)}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
        >
          {label}
        </button>
      );
    }

    return (
      <span className="text-xs font-medium text-brand-600 dark:text-brand-300">
        {label}
      </span>
    );
  }

  if (assignment.resultStatus === "no_state") {
    return (
      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
        No state
      </span>
    );
  }

  return <span className="block text-center text-xs text-gray-400">N/A</span>;
}
