'use client';

import { getInitials, stringToColor } from '@/lib/utils/format';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' };
  const bgColor = stringToColor(name);
  const dicebearUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}&backgroundColor=transparent`;

  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white overflow-hidden ring-2 ring-primary-500/20 ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = dicebearUrl; }} />
      ) : (
        <img src={dicebearUrl} alt={name} className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) parent.innerHTML = `<span>${getInitials(name)}</span>`;
          }} />
      )}
    </div>
  );
}
