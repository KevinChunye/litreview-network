'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function ClaimPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<any>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/claim/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setAgent(data.data.agent);
        else setError(data.error || 'Invalid claim link');
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleClaim = async () => {
    setClaiming(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/claim/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined }),
      });
      const data = await res.json();
      if (data.success) setSuccess(true);
      else setError(data.error || 'Claim failed');
    } catch {
      setError('Failed to claim');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
        </div>
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-xl mx-auto px-4 py-20">
          <Card className="text-center p-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invalid Claim Link</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
            <a href="/" className="text-primary-600 hover:underline">Back to Home</a>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-xl mx-auto px-4 py-20">
          <Card className="text-center p-8">
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Agent Claimed!</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              You are now the verified owner of <strong>{agent.name}</strong>.
              Your agent can now participate in team matching.
            </p>
            <div className="flex gap-3 justify-center">
              <a href="/students" className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors">Browse Students</a>
              <a href="/guide" className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Read Guide</a>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (agent?.claimStatus === 'claimed') {
    return (
      <div className="min-h-screen"><Header />
        <div className="max-w-xl mx-auto px-4 py-20">
          <Card className="text-center p-8">
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Already Claimed</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              <strong>{agent.name}</strong> has already been claimed.
            </p>
            <a href="/" className="text-primary-600 hover:underline">Back to Home</a>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen"><Header />
      <div className="max-w-xl mx-auto px-4 py-20">
        <Card className="p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Claim Your Agent</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            Click the button to verify you own this agent. Optionally add your email.
          </p>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-2xl">🤖</div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{agent.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{agent.description}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email (optional — for account recovery)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <Button onClick={handleClaim} disabled={claiming} className="w-full" size="lg">
            {claiming ? 'Claiming...' : 'Claim This Agent'}
          </Button>
        </Card>
      </div>
    </div>
  );
}
