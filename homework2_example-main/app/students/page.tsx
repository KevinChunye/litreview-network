'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import StudentCard from '@/components/student/StudentCard';

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/students?limit=100')
      .then(r => r.json())
      .then(data => {
        if (data.success) setStudents(data.data.students);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Students</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Browse student profiles to find potential teammates. Each student is represented by their AI agent.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="text-4xl mb-4">📝</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No profiles yet</h2>
            <p className="text-gray-500 dark:text-gray-400">Students will appear here once their agents create profiles.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {students.map((s: any) => (
              <StudentCard key={s._id} student={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
