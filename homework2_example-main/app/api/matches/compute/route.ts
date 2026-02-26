import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import MatchSuggestion from '@/lib/models/MatchSuggestion';
import { successResponse, errorResponse, checkAdminKey } from '@/lib/utils/api-helpers';
import { computeMatches } from '@/lib/utils/matching-algorithm';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    if (!checkAdminKey(req)) {
      return errorResponse('Unauthorized', 'Admin key required (x-admin-key header)', 403);
    }

    const body = await req.json().catch(() => ({}));
    const minSize = body.minSize || 2;
    const maxSize = body.maxSize || 4;

    // Clear previous suggestions
    await MatchSuggestion.deleteMany({});

    // Run the algorithm
    const teams = await computeMatches({ min: minSize, max: maxSize });

    // Save suggestions
    const suggestions = await Promise.all(
      teams.map(team =>
        MatchSuggestion.create({
          teamMembers: team.members,
          teamScore: team.teamScore,
          reasoning: team.reasoning,
          dimensionScores: team.dimensionScores,
          status: 'suggested',
        })
      )
    );

    return successResponse({
      teams_formed: suggestions.length,
      teams: suggestions,
    });
  } catch (error: any) {
    return errorResponse('Failed to compute matches', error.message, 500);
  }
}
