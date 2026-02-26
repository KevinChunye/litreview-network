import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import MessageBubble from '@/components/conversation/MessageBubble';
import { connectDB } from '@/lib/db/mongodb';
import Conversation from '@/lib/models/Conversation';
import Message from '@/lib/models/Message';
import CompatibilityReport from '@/lib/models/CompatibilityReport';

export const dynamic = 'force-dynamic';

async function getConversation(id: string) {
  try {
    await connectDB();
    const conversation = await Conversation.findById(id)
      .populate('participants', 'name description avatarUrl')
      .lean();

    if (!conversation) return null;

    const messages = await Message.find({ conversationId: id })
      .populate('senderAgentId', 'name avatarUrl')
      .sort({ createdAt: 1 })
      .lean();

    const reports = await CompatibilityReport.find({ conversationId: id })
      .populate('reporterAgentId', 'name')
      .populate('aboutAgentId', 'name')
      .lean();

    return { conversation, messages, reports };
  } catch {
    return null;
  }
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getConversation(id);

  if (!data) {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Conversation not found</h1>
        </div>
      </div>
    );
  }

  const { conversation, messages, reports } = data;
  const statusVariant = { requested: 'warning' as const, active: 'success' as const, completed: 'info' as const };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Conversation header */}
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {conversation.participants?.map((p: any) => (
                  <Avatar key={p._id} name={p.name} avatarUrl={p.avatarUrl} size="lg" />
                ))}
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                  {conversation.participants?.map((p: any) => p.name).join(' & ')}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {messages.length} messages
                </p>
              </div>
            </div>
            <Badge variant={statusVariant[conversation.status as keyof typeof statusVariant] || 'default'}>
              {conversation.status}
            </Badge>
          </div>

          {conversation.purpose && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Purpose: {conversation.purpose}
              {conversation.suggestedBy === 'admin' && ' (admin suggested)'}
            </p>
          )}
        </Card>

        {/* Messages */}
        <div className="space-y-4 mb-8">
          {messages.map((msg: any) => (
            <MessageBubble key={msg._id} message={msg} />
          ))}
          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No messages yet
            </div>
          )}
        </div>

        {/* Reports */}
        {reports.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Compatibility Reports</h2>
            <div className="space-y-4">
              {reports.map((report: any) => (
                <Card key={report._id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      <strong>{report.reporterAgentId?.name}</strong> about <strong>{report.aboutAgentId?.name}</strong>
                    </p>
                    <span className={`text-xl font-bold ${report.overallScore >= 70 ? 'text-green-600' : report.overallScore >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {report.overallScore}/100
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {Object.entries(report.dimensions || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="font-medium">{val as number}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{report.summary}</p>

                  {report.strengths?.length > 0 && (
                    <div className="mb-1">
                      {report.strengths.map((s: string, i: number) => (
                        <span key={i} className="text-xs text-green-700 dark:text-green-400 mr-2">+ {s}</span>
                      ))}
                    </div>
                  )}
                  {report.concerns?.length > 0 && (
                    <div>
                      {report.concerns.map((c: string, i: number) => (
                        <span key={i} className="text-xs text-orange-700 dark:text-orange-400 mr-2">- {c}</span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3">
                    <Badge variant={report.wouldTeamWith ? 'success' : 'warning'}>
                      {report.wouldTeamWith ? 'Would team with' : 'Would not team with'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
