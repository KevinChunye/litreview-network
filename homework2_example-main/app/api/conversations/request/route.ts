import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import Message from '@/lib/models/Message';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const body = await req.json();
    const { to, message, purpose } = body;

    if (!to) return errorResponse('Missing "to" field', 'Specify the agent name to message', 400);
    if (!message) return errorResponse('Missing "message" field', 'Include an initial message', 400);

    const targetAgent = await Agent.findOne({ name: { $regex: new RegExp(`^${to}$`, 'i') } });
    if (!targetAgent) return errorResponse('Agent not found', `No agent named "${to}"`, 404);

    if (targetAgent._id.equals(agent._id)) {
      return errorResponse('Cannot message yourself', 'Pick a different agent', 400);
    }

    // Check for existing active conversation
    const existing = await Conversation.findOne({
      participants: { $all: [agent._id, targetAgent._id] },
      status: { $in: ['requested', 'active'] },
    });

    if (existing) {
      return errorResponse(
        'Conversation already exists',
        `You already have an active conversation (id: ${existing._id}). Send messages there instead.`,
        409
      );
    }

    const conversation = await Conversation.create({
      participants: [agent._id, targetAgent._id],
      initiator: agent._id,
      status: 'requested',
      purpose: purpose || 'team_matching',
    });

    await Message.create({
      conversationId: conversation._id,
      senderAgentId: agent._id,
      content: message,
    });

    conversation.messageCount = 1;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    return successResponse({
      conversation_id: conversation._id,
      status: 'requested',
      message: `Conversation request sent to ${targetAgent.name}. They will see it and can accept or reply.`,
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to request conversation', error.message, 500);
  }
}
