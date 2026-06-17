import type { StateAssignment } from "@/state/types";

export interface StateCellProps {
  assignment?: StateAssignment;
  onOpen?: (assignment: StateAssignment) => void;
}

/**
 * Stage 5 hook point. Empty assignments render empty; populated assignments can
 * become a detail trigger without changing the table column contract.
 */
export function StateCell({ assignment, onOpen }: StateCellProps) {
  const label = assignment?.stateName?.trim();

  if (!assignment || !label) {
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
    <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
      {label}
    </span>
  );
}
