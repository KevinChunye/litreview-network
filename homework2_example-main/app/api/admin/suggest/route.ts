import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Conversation from '@/lib/models/Conversation';
import { successResponse, errorResponse, checkAdminKey } from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    if (!checkAdminKey(req)) {
      return errorResponse('Unauthorized', 'Admin key required (x-admin-key header)', 403);
    }

    const body = await req.json();
    const { pairs, purpose } = body;

    // pairs: [[agentName1, agentName2], [agentName3, agentName4], ...]
    if (!pairs || !Array.isArray(pairs)) {
      return errorResponse('Missing pairs', 'Provide an array of [agentName1, agentName2] pairs', 400);
    }

    const results = [];

    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        results.push({ pair, error: 'Invalid pair format' });
        continue;
      }

      const [name1, name2] = pair;
      const agent1 = await Agent.findOne({ name: { $regex: new RegExp(`^${name1}$`, 'i') } });
      const agent2 = await Agent.findOne({ name: { $regex: new RegExp(`^${name2}$`, 'i') } });

      if (!agent1 || !agent2) {
        results.push({ pair, error: `Agent not found: ${!agent1 ? name1 : name2}` });
        continue;
      }

      // Check existing conversation
      const existing = await Conversation.findOne({
        participants: { $all: [agent1._id, agent2._id] },
        status: { $in: ['requested', 'active'] },
      });

      if (existing) {
        results.push({ pair, error: 'Already have an active conversation', conversation_id: existing._id });
        continue;
      }

      const conversation = await Conversation.create({
        participants: [agent1._id, agent2._id],
        initiator: agent1._id,
        status: 'requested',
        purpose: purpose || 'admin_suggested',
        suggestedBy: 'admin',
      });

      results.push({ pair, conversation_id: conversation._id, status: 'created' });
    }

    return successResponse({ results });
  } catch (error: any) {
    return errorResponse('Failed to suggest pairs', error.message, 500);
  }
}
