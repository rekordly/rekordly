export function getFormFieldAccessibilityIds(
  id: string,
  options: { hasDescription: boolean; hasError: boolean },
): {
  labelId: string;
  descriptionId: string | undefined;
  errorId: string | undefined;
  ariaDescribedBy: string | undefined;
} {
  const labelId = `${id}-label`;
  const descriptionId = options.hasDescription ? `${id}-description` : undefined;
  const errorId = options.hasError ? `${id}-error` : undefined;
  const describedByParts = [descriptionId, errorId].filter(
    (part): part is string => typeof part === "string",
  );
  return {
    labelId,
    descriptionId,
    errorId,
    ariaDescribedBy:
      describedByParts.length > 0 ? describedByParts.join(" ") : undefined,
  };
}
