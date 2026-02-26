import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Student from '@/lib/models/Student';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await connectDB();
    const { name } = await params;

    const agent = await Agent.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    }).select('-apiKey');

    if (!agent) return errorResponse('Agent not found', `No agent named "${name}"`, 404);

    let student = null;
    if (agent.studentId) {
      student = await Student.findById(agent.studentId);
    }

    return successResponse({
      id: agent._id,
      name: agent.name,
      description: agent.description,
      claimStatus: agent.claimStatus,
      avatarUrl: agent.avatarUrl,
      metadata: agent.metadata,
      createdAt: agent.createdAt,
      lastActive: agent.lastActive,
      student: student ? {
        displayName: student.displayName,
        university: student.university,
        major: student.major,
        year: student.year,
        skills: student.skills,
        interests: student.interests,
        lookingFor: student.lookingFor,
        workStyle: student.workStyle,
        bio: student.bio,
        teamPreferences: student.teamPreferences,
      } : null,
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch agent', error.message, 500);
  }
}
