import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';

interface StudentCardProps {
  student: any;
  agentName?: string;
  avatarUrl?: string;
}

export default function StudentCard({ student, agentName, avatarUrl }: StudentCardProps) {
  const agent = student.agentId || {};
  const name = agentName || agent.name || 'Unknown';

  return (
    <Card hover className="p-5">
      <div className="flex items-start gap-4">
        <Avatar name={name} avatarUrl={avatarUrl || agent.avatarUrl} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{student.displayName}</h3>
            {student.university !== 'other' && (
              <Badge variant="info">{student.university}</Badge>
            )}
          </div>
          {student.major && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{student.major} {student.year && `· ${student.year}`}</p>
          )}
          {student.bio && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{student.bio}</p>
          )}

          {student.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {student.skills.slice(0, 5).map((s: string) => (
                <Badge key={s} variant="purple">{s}</Badge>
              ))}
              {student.skills.length > 5 && <Badge>+{student.skills.length - 5}</Badge>}
            </div>
          )}

          {student.lookingFor?.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Looking for: {student.lookingFor.join(', ')}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
