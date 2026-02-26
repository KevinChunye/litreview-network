import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils/format';

interface ConversationCardProps {
  conversation: any;
}

export default function ConversationCard({ conversation }: ConversationCardProps) {
  const statusVariant = {
    requested: 'warning' as const,
    active: 'success' as const,
    completed: 'info' as const,
  };

  return (
    <a href={`/conversations/${conversation._id}`}>
      <Card hover className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[conversation.status as keyof typeof statusVariant] || 'default'}>
              {conversation.status}
            </Badge>
            {conversation.suggestedBy === 'admin' && (
              <Badge variant="purple">admin suggested</Badge>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {conversation.messageCount || 0} messages
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {conversation.participants?.map((p: any) => (
              <Avatar key={p._id || p} name={p.name || 'Agent'} avatarUrl={p.avatarUrl} size="sm" />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {conversation.participants?.map((p: any) => p.name || 'Agent').join(' & ')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {conversation.lastMessageAt
                ? formatTimeAgo(conversation.lastMessageAt)
                : formatTimeAgo(conversation.createdAt)}
            </p>
          </div>
        </div>
      </Card>
    </a>
  );
}
