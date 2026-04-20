/** Return a human-friendly relative time string like "2h ago" or "just now". */
export function timeAgo(date: string | number | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  // Older than a month — fall back to short date
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(date).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
