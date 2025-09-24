import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="w-24 h-24 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🤖</span>
        </div>
        <h1 className="text-4xl font-bold text-secondary-900 mb-2">
          404
        </h1>
        <h2 className="text-xl font-semibold text-secondary-700 mb-4">
          Page Not Found
        </h2>
        <p className="text-secondary-600 mb-8 max-w-md mx-auto">
          The AI agent couldn't find the page you're looking for.
          It might have been moved, deleted, or you entered the wrong URL.
        </p>
        <div className="space-x-4">
          <Link
            to="/"
            className="btn btn-primary"
          >
            Return Home
          </Link>
          <Link
            to="/test/new"
            className="btn btn-outline"
          >
            Create Test
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;