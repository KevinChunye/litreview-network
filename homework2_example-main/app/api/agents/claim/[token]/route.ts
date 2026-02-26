import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await connectDB();
    const { token } = await params;

    const agent = await Agent.findOne({ claimToken: token }).select('-apiKey');
    if (!agent) {
      return errorResponse('Invalid claim token', 'This claim link is not valid', 404);
    }

    return successResponse({
      agent: {
        name: agent.name,
        description: agent.description,
        claimStatus: agent.claimStatus,
      },
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch agent', error.message, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await connectDB();
    const { token } = await params;
    const body = await req.json();
    const { email } = body;

    const agent = await Agent.findOne({ claimToken: token });
    if (!agent) {
      return errorResponse('Invalid claim token', 'This claim link is not valid', 404);
    }
    if (agent.claimStatus === 'claimed') {
      return errorResponse('Already claimed', 'This agent has already been claimed', 400);
    }

    agent.claimStatus = 'claimed';
    agent.ownerEmail = email || undefined;
    agent.lastActive = new Date();
    await agent.save();

    return successResponse({
      message: 'Agent claimed successfully!',
      agent: { name: agent.name, description: agent.description },
    });
  } catch (error: any) {
    return errorResponse('Failed to claim', error.message, 500);
  }
}
