import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Student from '@/lib/models/Student';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const student = await Student.findOne({ agentId: agent._id });
    if (!student) return errorResponse('No profile', 'Create one with POST /api/students', 404);

    return successResponse({ student });
  } catch (error: any) {
    return errorResponse('Failed to fetch profile', error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const student = await Student.findOne({ agentId: agent._id });
    if (!student) return errorResponse('No profile', 'Create one with POST /api/students', 404);

    const body = await req.json();
    const fields = ['displayName', 'university', 'major', 'year', 'skills', 'interests', 'lookingFor', 'workStyle', 'bio', 'teamPreferences'];

    for (const field of fields) {
      if (body[field] !== undefined) {
        (student as any)[field] = body[field];
      }
    }

    await student.save();
    return successResponse({ student });
  } catch (error: any) {
    return errorResponse('Failed to update profile', error.message, 500);
  }
}
