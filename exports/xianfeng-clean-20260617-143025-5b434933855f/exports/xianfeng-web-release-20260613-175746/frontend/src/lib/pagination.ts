export type CollapsedPageItem = number | "ellipsis";

export function getCollapsedPages(currentPage: number, totalPages: number, siblingCount = 1): CollapsedPageItem[] {
  const current = Math.max(1, Math.min(currentPage, totalPages));
  const total = Math.max(1, totalPages);

  if (total <= 7 + siblingCount * 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const left = Math.max(2, current - siblingCount);
  const right = Math.min(total - 1, current + siblingCount);
  const items: CollapsedPageItem[] = [1];

  if (left > 2) items.push("ellipsis");
  for (let page = left; page <= right; page += 1) items.push(page);
  if (right < total - 1) items.push("ellipsis");

  items.push(total);
  return items;
}
