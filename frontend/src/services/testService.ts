import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add authorization token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const testService = {
  // Execute a test scenario
  executeTest: async (payload: {
    scenario: string;
    url: string;
    options?: any;
  }) => {
    return apiClient.post('/tests/execute', payload);
  },

  // Get execution status
  getExecutionStatus: async (executionId: string) => {
    return apiClient.get(`/tests/execution/${executionId}/status`);
  },

  // Get execution results
  getExecutionResults: async (executionId: string) => {
    return apiClient.get(`/tests/execution/${executionId}/results`);
  },

  // Stop execution
  stopExecution: async (executionId: string) => {
    return apiClient.post(`/tests/execution/${executionId}/stop`);
  },

  // Get execution history
  getExecutionHistory: async (params: { page?: number; limit?: number } = {}) => {
    return apiClient.get('/tests/history', { params });
  },
};

export const aiService = {
  // Parse scenario into steps
  parseScenario: async (scenario: string, context?: any) => {
    return apiClient.post('/ai/parse-scenario', { scenario, context });
  },

  // Generate actions from instruction
  generateActions: async (payload: {
    instruction: string;
    pageContext?: any;
    previousActions?: any[];
  }) => {
    return apiClient.post('/ai/generate-actions', payload);
  },

  // Analyze test results
  analyzeResults: async (payload: {
    testResults: any;
    scenario: string;
    expectations?: string;
  }) => {
    return apiClient.post('/ai/analyze-results', payload);
  },

  // Get available models
  getModels: async () => {
    return apiClient.get('/ai/models');
  },

  // Switch AI model
  switchModel: async (modelId: string) => {
    return apiClient.post('/ai/models/switch', { modelId });
  },

  // Convert English text to code
  convertToCode: async (payload: {
    englishText: string;
    targetLanguage?: string;
    framework?: string;
  }) => {
    return apiClient.post('/ai/convert-to-code', payload);
  },
};

export const healthService = {
  // Basic health check
  getHealth: async () => {
    return apiClient.get('/health');
  },

  // Detailed health check
  getDetailedHealth: async () => {
    return apiClient.get('/health/detailed');
  },
};

export default apiClient;