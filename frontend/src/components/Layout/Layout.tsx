import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { initializeGuestMode } from '../../store/slices/authSlice';

const Layout: React.FC = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { isAuthenticated } = useAppSelector(state => state.auth);

  useEffect(() => {
    // Initialize guest mode for MVP
    if (!isAuthenticated) {
      dispatch(initializeGuestMode());
    }
  }, [dispatch, isAuthenticated]);

  const navigationItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/test-editor', label: 'Test Editor', icon: '✏️' },
    { path: '/rl-exploration', label: 'RL Exploration', icon: '🧠' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
    { path: '/docs', label: 'Documentation', icon: '📖' },
  ];

  const isActivePath = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-secondary-50">
      <header className="bg-white shadow-sm border-b border-secondary-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
                <div>
                  <h1 className="text-xl font-semibold text-secondary-900">
                    🤖 AI Testing Agent
                  </h1>
                  <p className="text-xs text-secondary-500 -mt-1">Human Supervised</p>
                </div>
              </Link>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              {navigationItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActivePath(item.path)
                      ? 'bg-primary-100 text-primary-700 shadow-sm'
                      : 'text-secondary-600 hover:text-secondary-900 hover:bg-secondary-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-secondary-600">MVP v1.0.0</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;