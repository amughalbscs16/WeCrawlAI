import React from 'react';
import { Routes, Route } from 'react-router-dom';

import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import TestEditor from './pages/TestEditor';
import TestResults from './pages/TestResults';
import ExecutionMonitor from './pages/ExecutionMonitor';
import Settings from './pages/Settings';
import Documentation from './pages/Documentation';
import RLExploration from './pages/RLExploration';
import NotFound from './pages/NotFound';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="test-editor" element={<TestEditor />} />
          <Route path="test/edit/:id" element={<TestEditor />} />
          <Route path="executions/:executionId" element={<ExecutionMonitor />} />
          <Route path="test-results/:executionId" element={<TestResults />} />
          <Route path="rl-exploration" element={<RLExploration />} />
          <Route path="settings" element={<Settings />} />
          <Route path="docs" element={<Documentation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;