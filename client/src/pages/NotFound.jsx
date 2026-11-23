import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="max-w-sm mx-auto py-16 text-center space-y-3">
      <div className="text-3xl font-bold text-zinc-400">404</div>
      <h2 className="text-lg font-semibold text-zinc-100">Page not found</h2>
      <p className="text-xs text-zinc-400">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="pt-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium text-xs bg-brand-600 hover:bg-brand-500 text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return home</span>
        </Link>
      </div>
    </div>
  );
}
