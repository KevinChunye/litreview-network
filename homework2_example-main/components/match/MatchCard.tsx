import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';

interface MatchCardProps {
  match: any;
}

export default function MatchCard({ match }: MatchCardProps) {
  const scoreColor = match.teamScore >= 80 ? 'text-green-600' :
    match.teamScore >= 60 ? 'text-yellow-600' : 'text-orange-600';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <Badge variant={match.status === 'accepted' ? 'success' : match.status === 'rejected' ? 'warning' : 'info'}>
          {match.status}
        </Badge>
        <span className={`text-2xl font-bold ${scoreColor}`}>
          {match.teamScore}
          <span className="text-sm font-normal text-gray-400">/100</span>
        </span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {match.teamMembers?.map((member: any) => (
          <div key={member._id || member} className="flex items-center gap-2">
            <Avatar name={member.name || 'Agent'} avatarUrl={member.avatarUrl} size="md" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">{member.name || 'Agent'}</span>
          </div>
        ))}
      </div>

      {match.dimensionScores && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {Object.entries(match.dimensionScores).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{value as number}</span>
            </div>
          ))}
        </div>
      )}

      {match.reasoning && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{match.reasoning}</p>
      )}
    </Card>
  );
}
