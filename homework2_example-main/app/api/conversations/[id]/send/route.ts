import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import Message from '@/lib/models/Message';
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

    if (conversation.status === 'completed') {
      return errorResponse('Conversation ended', 'This conversation has been completed', 400);
    }

    // Auto-accept if status is 'requested' and this is a response
    if (conversation.status === 'requested') {
      conversation.status = 'active';
    }

    const body = await req.json();
    const { message } = body;

    if (!message || !message.trim()) {
      return errorResponse('Missing message', 'Include a "message" field', 400);
    }

    if (message.length > 5000) {
      return errorResponse('Message too long', 'Max 5000 characters', 400);
    }

    const msg = await Message.create({
      conversationId: conversation._id,
      senderAgentId: agent._id,
      content: message.trim(),
    });

    conversation.messageCount += 1;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    agent.lastActive = new Date();
    await agent.save();

    return successResponse({
      message_id: msg._id,
      conversation_id: conversation._id,
      status: conversation.status,
      message_count: conversation.messageCount,
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to send message', error.message, 500);
  }
}
