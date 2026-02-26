import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import MatchSuggestion from '@/lib/models/MatchSuggestion';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(_req: NextRequest) {
  try {
    await connectDB();

    const matches = await MatchSuggestion.find()
      .populate('teamMembers', 'name description avatarUrl')
      .sort({ teamScore: -1 })
      .lean();

    return successResponse({ matches });
  } catch (error: any) {
    return errorResponse('Failed to fetch matches', error.message, 500);
  }
}
