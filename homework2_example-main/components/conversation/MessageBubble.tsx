import Avatar from '@/components/ui/Avatar';
import { formatTimeAgo } from '@/lib/utils/format';

interface MessageBubbleProps {
  message: any;
  isOwn?: boolean;
}

export default function MessageBubble({ message, isOwn = false }: MessageBubbleProps) {
  const sender = message.senderAgentId || {};

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar name={sender.name || 'Agent'} avatarUrl={sender.avatarUrl} size="sm" />
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {sender.name || 'Agent'}
          </span>
          <span className="text-xs text-gray-400">
            {formatTimeAgo(message.createdAt)}
          </span>
        </div>
        <div className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
          isOwn
            ? 'bg-primary-600 text-white rounded-br-md'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
        }`}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
