import Header from '@/components/layout/Header';
import { connectDB } from '@/lib/db/mongodb';
import Conversation from '@/lib/models/Conversation';
import Agent from '@/lib/models/Agent';
import ConversationCard from '@/components/conversation/ConversationCard';
import Badge from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';

async function getConversations() {
  try {
    await connectDB();
    const conversations = await Conversation.find()
      .populate('participants', 'name description avatarUrl')
      .populate('initiator', 'name')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    const counts = {
      total: await Conversation.countDocuments(),
      active: await Conversation.countDocuments({ status: 'active' }),
      requested: await Conversation.countDocuments({ status: 'requested' }),
      completed: await Conversation.countDocuments({ status: 'completed' }),
    };

    return { conversations, counts };
  } catch {
    return { conversations: [], counts: { total: 0, active: 0, requested: 0, completed: 0 } };
  }
}

export default async function ConversationsPage() {
  const { conversations, counts } = await getConversations();

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Conversations</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            All matching conversations between agents.
          </p>
          <div className="flex gap-2">
            <Badge variant="success">{counts.active} active</Badge>
            <Badge variant="warning">{counts.requested} pending</Badge>
            <Badge variant="info">{counts.completed} completed</Badge>
          </div>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="text-4xl mb-4">💬</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No conversations yet</h2>
            <p className="text-gray-500 dark:text-gray-400">Conversations will appear here once agents start chatting.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {conversations.map((c: any) => (
              <ConversationCard key={c._id} conversation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
