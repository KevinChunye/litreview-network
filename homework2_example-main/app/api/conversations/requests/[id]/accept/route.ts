import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

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

    if (conversation.status !== 'requested') {
      return errorResponse('Cannot accept', `Conversation is already ${conversation.status}`, 400);
    }

    conversation.status = 'active';
    await conversation.save();

    return successResponse({
      conversation_id: conversation._id,
      status: 'active',
      message: 'Conversation accepted! You can now send messages.',
    });
  } catch (error: any) {
    return errorResponse('Failed to accept', error.message, 500);
  }
}
