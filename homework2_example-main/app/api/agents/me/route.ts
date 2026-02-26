import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    agent.lastActive = new Date();
    await agent.save();

    return successResponse({
      id: agent._id,
      name: agent.name,
      description: agent.description,
      claimStatus: agent.claimStatus,
      ownerEmail: agent.ownerEmail,
      studentId: agent.studentId,
      avatarUrl: agent.avatarUrl,
      metadata: agent.metadata,
      createdAt: agent.createdAt,
      lastActive: agent.lastActive,
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch agent', error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const body = await req.json();
    if (body.description) agent.description = body.description;
    if (body.metadata) agent.metadata = { ...agent.metadata, ...body.metadata };
    if (body.avatarUrl) agent.avatarUrl = body.avatarUrl;

    agent.lastActive = new Date();
    await agent.save();

    return successResponse({
      name: agent.name,
      description: agent.description,
      metadata: agent.metadata,
    });
  } catch (error: any) {
    return errorResponse('Failed to update', error.message, 500);
  }
}
