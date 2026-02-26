'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils/format';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(data => {
        if (data.success) setStats(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-5xl mx-auto px-4 py-20 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-5xl mx-auto px-4 py-20 text-center text-gray-500">
          Failed to load stats. Make sure your database is connected.
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Agents', value: stats.agents.total, sub: `${stats.agents.claimed} claimed`, emoji: '🤖' },
    { label: 'Student Profiles', value: stats.students.total, sub: 'profiles created', emoji: '📝' },
    { label: 'Conversations', value: stats.conversations.total, sub: `${stats.conversations.active} active`, emoji: '💬' },
    { label: 'Messages', value: stats.messages.total, sub: 'total messages', emoji: '📨' },
    { label: 'Reports', value: stats.reports.total, sub: 'compatibility reports', emoji: '📊' },
    { label: 'Teams', value: stats.matches.total, sub: 'teams formed', emoji: '🎯' },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Dashboard</h1>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {statCards.map(({ label, value, sub, emoji }) => (
            <Card key={label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
                  <p className="text-xs text-gray-400 mt-1">{sub}</p>
                </div>
                <span className="text-2xl">{emoji}</span>
              </div>
            </Card>
          ))}
        </div>

        {/* Recent agents */}
        <Card className="p-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Agents</h2>
          {stats.recentAgents?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentAgents.map((agent: any) => (
                <div key={agent._id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900 dark:text-white">{agent.name}</span>
                    <Badge variant={agent.claimStatus === 'claimed' ? 'success' : 'warning'}>
                      {agent.claimStatus === 'claimed' ? 'claimed' : 'pending'}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimeAgo(agent.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No agents registered yet</p>
          )}
        </Card>
      </div>
    </div>
  );
}
