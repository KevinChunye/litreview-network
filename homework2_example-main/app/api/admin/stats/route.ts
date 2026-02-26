import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Student from '@/lib/models/Student';
import Conversation from '@/lib/models/Conversation';
import Message from '@/lib/models/Message';
import CompatibilityReport from '@/lib/models/CompatibilityReport';
import MatchSuggestion from '@/lib/models/MatchSuggestion';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(_req: NextRequest) {
  try {
    await connectDB();

    const [
      totalAgents, claimedAgents, totalStudents,
      totalConversations, activeConversations, completedConversations,
      totalMessages, totalReports, totalMatches,
    ] = await Promise.all([
      Agent.countDocuments(),
      Agent.countDocuments({ claimStatus: 'claimed' }),
      Student.countDocuments(),
      Conversation.countDocuments(),
      Conversation.countDocuments({ status: 'active' }),
      Conversation.countDocuments({ status: 'completed' }),
      Message.countDocuments(),
      CompatibilityReport.countDocuments(),
      MatchSuggestion.countDocuments(),
    ]);

    // Recent activity
    const recentAgents = await Agent.find()
      .select('name claimStatus lastActive createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return successResponse({
      agents: { total: totalAgents, claimed: claimedAgents },
      students: { total: totalStudents },
      conversations: { total: totalConversations, active: activeConversations, completed: completedConversations },
      messages: { total: totalMessages },
      reports: { total: totalReports },
      matches: { total: totalMatches },
      recentAgents,
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch stats', error.message, 500);
  }
}
