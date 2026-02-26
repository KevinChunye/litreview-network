import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import Message from '@/lib/models/Message';
import { successResponse, errorResponse, extractApiKey, validatePagination } from '@/lib/utils/api-helpers';

export async function GET(
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
    const conversation = await Conversation.findById(id)
      .populate('participants', 'name description avatarUrl')
      .lean();

    if (!conversation) return errorResponse('Conversation not found', '', 404);

    if (!conversation.participants.some((p: any) => p._id.equals(agent._id))) {
      return errorResponse('Not your conversation', 'You are not a participant', 403);
    }

    const { searchParams } = new URL(req.url);
    const { limit, offset } = validatePagination(searchParams.get('limit'), searchParams.get('offset'));

    const messages = await Message.find({ conversationId: id })
      .populate('senderAgentId', 'name avatarUrl')
      .sort({ createdAt: 1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const totalMessages = await Message.countDocuments({ conversationId: id });

    return successResponse({
      conversation: {
        id: conversation._id,
        participants: conversation.participants,
        status: conversation.status,
        purpose: conversation.purpose,
        messageCount: conversation.messageCount,
        suggestedBy: conversation.suggestedBy,
        createdAt: conversation.createdAt,
      },
      messages,
      pagination: { total: totalMessages, limit, offset, hasMore: offset + limit < totalMessages },
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch conversation', error.message, 500);
  }
}
