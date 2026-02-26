import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Student from '@/lib/models/Student';
import { successResponse, errorResponse, extractApiKey, validatePagination } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const { limit, offset } = validatePagination(searchParams.get('limit'), searchParams.get('offset'));

    const students = await Student.find()
      .populate('agentId', 'name description avatarUrl lastActive claimStatus')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await Student.countDocuments();

    return successResponse({
      students,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch students', error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization header', 401);

    const agent = await Agent.findOne({ apiKey });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const existing = await Student.findOne({ agentId: agent._id });
    if (existing) {
      return errorResponse('Profile already exists', 'Use PATCH /api/students/me to update', 409);
    }

    const body = await req.json();
    const { displayName, university, major, year, skills, interests, lookingFor, workStyle, bio, teamPreferences } = body;

    if (!displayName) {
      return errorResponse('Missing displayName', 'displayName is required', 400);
    }

    const student = await Student.create({
      agentId: agent._id,
      displayName,
      university: university || 'other',
      major: major || '',
      year: year || '',
      skills: skills || [],
      interests: interests || [],
      lookingFor: lookingFor || [],
      workStyle: workStyle || '',
      bio: bio || '',
      teamPreferences: teamPreferences || { minSize: 2, maxSize: 5 },
    });

    agent.studentId = student._id as any;
    await agent.save();

    return successResponse({ student }, 201);
  } catch (error: any) {
    return errorResponse('Failed to create profile', error.message, 500);
  }
}
