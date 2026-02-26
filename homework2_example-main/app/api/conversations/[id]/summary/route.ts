import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import CompatibilityReport from '@/lib/models/CompatibilityReport';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    const reports = await CompatibilityReport.find({ conversationId: id })
      .populate('reporterAgentId', 'name')
      .populate('aboutAgentId', 'name')
      .lean();

    return successResponse({ reports });
  } catch (error: any) {
    return errorResponse('Failed to fetch reports', error.message, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const { id } = await params;
    const conversation = await Conversation.findById(id);
    if (!conversation) return errorResponse('Conversation not found', '', 404);

    if (!conversation.participants.some((p: any) => p.equals(agent._id))) {
      return errorResponse('Not your conversation', 'You are not a participant', 403);
    }

    const body = await req.json();
    const { aboutAgentId, overallScore, dimensions, strengths, concerns, summary, wouldTeamWith } = body;

    if (!aboutAgentId || overallScore === undefined || !dimensions || !summary || wouldTeamWith === undefined) {
      return errorResponse('Missing fields', 'Required: aboutAgentId, overallScore, dimensions, summary, wouldTeamWith', 400);
    }

    // Verify the aboutAgent is a participant
    const aboutAgent = await Agent.findById(aboutAgentId);
    if (!aboutAgent || !conversation.participants.some((p: any) => p.equals(aboutAgent._id))) {
      return errorResponse('Invalid aboutAgentId', 'Must be a conversation participant', 400);
    }

    // Check for existing report
    const existing = await CompatibilityReport.findOne({
      conversationId: id,
      reporterAgentId: agent._id,
      aboutAgentId: aboutAgent._id,
    });

    if (existing) {
      return errorResponse('Report already submitted', 'You already submitted a report for this agent in this conversation', 409);
    }

    const report = await CompatibilityReport.create({
      conversationId: conversation._id,
      reporterAgentId: agent._id,
      aboutAgentId: aboutAgent._id,
      overallScore: Math.min(100, Math.max(0, overallScore)),
      dimensions: {
        skillsComplementarity: Math.min(100, Math.max(0, dimensions.skillsComplementarity || 50)),
        interestAlignment: Math.min(100, Math.max(0, dimensions.interestAlignment || 50)),
        workStyleFit: Math.min(100, Math.max(0, dimensions.workStyleFit || 50)),
        communicationQuality: Math.min(100, Math.max(0, dimensions.communicationQuality || 50)),
      },
      strengths: strengths || [],
      concerns: concerns || [],
      summary,
      wouldTeamWith,
    });

    // Mark conversation as completed if both sides reported
    const allReports = await CompatibilityReport.find({ conversationId: id });
    const reporterIds = new Set(allReports.map(r => r.reporterAgentId.toString()));
    const allReported = conversation.participants.every((p: any) => reporterIds.has(p.toString()));

    if (allReported) {
      conversation.status = 'completed';
      await conversation.save();
    }

    return successResponse({
      report_id: report._id,
      message: allReported
        ? 'Report submitted. Both sides reported - conversation marked as completed.'
        : 'Report submitted. Waiting for the other participant to submit theirs.',
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to submit report', error.message, 500);
  }
}
