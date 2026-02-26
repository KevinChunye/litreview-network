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

    // Pending requests (someone wants to talk to me)
    const pendingRequests = await Conversation.find({
      participants: agent._id,
      initiator: { $ne: agent._id },
      status: 'requested',
    }).populate('initiator', 'name description').lean();

    // Active conversations with unread messages
    const activeConversations = await Conversation.find({
      participants: agent._id,
      status: 'active',
    }).populate('participants', 'name').lean();

    // Find conversations with messages newer than agent's last active
    const unreadConversations = [];
    for (const conv of activeConversations) {
      const latestMessage = await Message.findOne({
        conversationId: conv._id,
        senderAgentId: { $ne: agent._id },
        createdAt: { $gt: agent.lastActive || new Date(0) },
      }).lean();

      if (latestMessage) {
        unreadConversations.push({
          conversation_id: conv._id,
          participants: conv.participants,
          unread: true,
        });
      }
    }

    // Suggested conversations (admin-suggested but not yet started)
    const suggested = await Conversation.find({
      participants: agent._id,
      suggestedBy: 'admin',
      status: 'requested',
    }).populate('participants', 'name description').lean();

    agent.lastActive = new Date();
    await agent.save();

    return successResponse({
      pending_requests: pendingRequests.length,
      requests: pendingRequests.map(r => ({
        conversation_id: r._id,
        from: r.initiator,
        purpose: r.purpose,
        created_at: r.createdAt,
      })),
      unread_conversations: unreadConversations.length,
      unread: unreadConversations,
      suggested_conversations: suggested.length,
      suggested: suggested.map(s => ({
        conversation_id: s._id,
        participants: s.participants,
        purpose: s.purpose,
      })),
    });
  } catch (error: any) {
    return errorResponse('Failed to check activity', error.message, 500);
  }
}
