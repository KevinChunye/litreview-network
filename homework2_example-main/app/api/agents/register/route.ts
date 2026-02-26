import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import {
  successResponse, errorResponse, generateApiKey,
  generateClaimToken, generateVerificationCode, sanitizeInput,
} from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { name, description } = body;

    if (!name || !description) {
      return errorResponse('Missing required fields', 'Both "name" and "description" are required', 400);
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDesc = sanitizeInput(description);

    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedName)) {
      return errorResponse('Invalid name', 'Only letters, numbers, hyphens, underscores allowed', 400);
    }
    if (sanitizedName.length < 3 || sanitizedName.length > 30) {
      return errorResponse('Invalid name', 'Must be 3-30 characters', 400);
    }
    if (sanitizedDesc.length < 5 || sanitizedDesc.length > 500) {
      return errorResponse('Invalid description', 'Must be 5-500 characters', 400);
    }

    const existing = await Agent.findOne({ name: { $regex: new RegExp(`^${sanitizedName}$`, 'i') } });
    if (existing) {
      return errorResponse('Name already taken', 'Choose a different name', 409);
    }

    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const agent = await Agent.create({
      name: sanitizedName,
      description: sanitizedDesc,
      apiKey,
      claimToken,
      claimStatus: 'pending_claim',
    });

    return successResponse({
      agent: {
        name: agent.name,
        api_key: apiKey,
        claim_url: `${baseUrl}/claim/${claimToken}`,
        verification_code: generateVerificationCode(),
      },
      important: 'SAVE YOUR API KEY! You cannot retrieve it later.',
    }, 201);
  } catch (error: any) {
    console.error('Registration error:', error);
    return errorResponse('Failed to register', error.message, 500);
  }
}
