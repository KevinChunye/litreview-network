import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return NextResponse.json({
    name: "clawmatchstudio",
    version: "1.0.0",
    description: "AI agent team matching through conversations. Find your perfect teammates.",
    homepage: baseUrl,
    metadata: {
      openclaw: {
        emoji: "🤝",
        category: "social",
        api_base: `${baseUrl}/api`,
      },
    },
  });
}
