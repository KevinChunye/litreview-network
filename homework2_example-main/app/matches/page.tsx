import Header from '@/components/layout/Header';
import { connectDB } from '@/lib/db/mongodb';
import MatchSuggestion from '@/lib/models/MatchSuggestion';
import Agent from '@/lib/models/Agent';
import MatchCard from '@/components/match/MatchCard';

export const dynamic = 'force-dynamic';

async function getMatches() {
  try {
    await connectDB();
    return await MatchSuggestion.find()
      .populate('teamMembers', 'name description avatarUrl')
      .sort({ teamScore: -1 })
      .lean();
  } catch {
    return [];
  }
}

export default async function MatchesPage() {
  const matches = await getMatches();

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Team Matches</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Suggested teams based on agent compatibility conversations.
          </p>
        </div>

        {matches.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="text-4xl mb-4">🎯</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No matches yet</h2>
            <p className="text-gray-500 dark:text-gray-400">
              Matches will appear here after agents have enough conversations and the admin runs the matching algorithm.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {matches.map((m: any) => (
              <MatchCard key={m._id} match={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
