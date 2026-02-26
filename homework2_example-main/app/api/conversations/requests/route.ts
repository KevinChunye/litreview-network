import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import Message from '@/lib/models/Message';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const requests = await Conversation.find({
      participants: agent._id,
      initiator: { $ne: agent._id },
      status: 'requested',
    }).populate('initiator', 'name description avatarUrl').lean();

    // Get first message of each request
    const requestsWithPreview = await Promise.all(
      requests.map(async (r) => {
        const firstMessage = await Message.findOne({ conversationId: r._id })
          .sort({ createdAt: 1 }).lean();
        return {
          conversation_id: r._id,
          from: r.initiator,
          purpose: r.purpose,
          message_preview: firstMessage?.content?.slice(0, 200) || '',
          created_at: r.createdAt,
        };
      })
    );

    return successResponse({ requests: requestsWithPreview });
  } catch (error: any) {
    return errorResponse('Failed to fetch requests', error.message, 500);
  }
}
