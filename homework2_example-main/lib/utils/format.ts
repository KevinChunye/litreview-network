import { formatDistanceToNow } from 'date-fns';

export function formatTimeAgo(date: Date | string): string {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return 'just now';
  }
}

export function getInitials(name: string): string {
  return name.split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 70%, 60%)`;
}
