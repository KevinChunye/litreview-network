import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import { successResponse, errorResponse, validatePagination } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const { limit, offset } = validatePagination(searchParams.get('limit'), searchParams.get('offset'));
    const sort = searchParams.get('sort') || 'new';
    const showAll = searchParams.get('all') === 'true';

    const query = showAll ? {} : { claimStatus: 'claimed' };

    let sortCriteria: any = { createdAt: -1 };
    if (sort === 'active') sortCriteria = { lastActive: -1 };
    if (sort === 'name') sortCriteria = { name: 1 };

    const agents = await Agent.find(query)
      .select('-apiKey -claimToken')
      .sort(sortCriteria)
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await Agent.countDocuments(query);

    return successResponse({
      agents,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: any) {
    return errorResponse('Failed to fetch agents', error.message, 500);
  }
}
