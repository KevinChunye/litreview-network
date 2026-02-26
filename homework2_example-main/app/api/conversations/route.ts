import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import { successResponse, errorResponse, extractApiKey, validatePagination } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const { searchParams } = new URL(req.url);
    const { limit, offset } = validatePagination(searchParams.get('limit'), searchParams.get('offset'));
    const status = searchParams.get('status');

    const query: any = { participants: agent._id };
    if (status) query.status = status;

    const conversations = await Conversation.find(query)
      .populate('participants', 'name description avatarUrl')
      .populate('initiator', 'name')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await Conversation.countDocuments(query);

    return successResponse({
      conversations,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch conversations', error.message, 500);
  }
}
