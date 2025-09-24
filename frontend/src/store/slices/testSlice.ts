import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { testService } from '../../services/testService';
import { TestExecution, TestScenario, TestResult } from '../../types/test';

interface TestState {
  currentScenario: TestScenario | null;
  executions: TestExecution[];
  currentExecution: TestExecution | null;
  results: TestResult | null;
  history: TestExecution[];
  loading: {
    executing: boolean;
    fetching: boolean;
    stopping: boolean;
  };
  error: string | null;
}

const initialState: TestState = {
  currentScenario: null,
  executions: [],
  currentExecution: null,
  results: null,
  history: [],
  loading: {
    executing: false,
    fetching: false,
    stopping: false,
  },
  error: null,
};

// Async thunks
export const executeTest = createAsyncThunk(
  'test/execute',
  async (payload: { scenario: string; url: string; options?: any }) => {
    const response = await testService.executeTest(payload);
    return response.data;
  }
);

export const fetchExecutionStatus = createAsyncThunk(
  'test/fetchStatus',
  async (executionId: string) => {
    const response = await testService.getExecutionStatus(executionId);
    return response.data;
  }
);

export const fetchExecutionResults = createAsyncThunk(
  'test/fetchResults',
  async (executionId: string) => {
    const response = await testService.getExecutionResults(executionId);
    return response.data;
  }
);

export const stopExecution = createAsyncThunk(
  'test/stop',
  async (executionId: string) => {
    const response = await testService.stopExecution(executionId);
    return response.data;
  }
);

export const fetchExecutionHistory = createAsyncThunk(
  'test/fetchHistory',
  async (params: { page?: number; limit?: number } = {}) => {
    const response = await testService.getExecutionHistory(params);
    return response.data;
  }
);

const testSlice = createSlice({
  name: 'test',
  initialState,
  reducers: {
    setCurrentScenario: (state, action: PayloadAction<TestScenario>) => {
      state.currentScenario = action.payload;
    },
    updateCurrentScenario: (state, action: PayloadAction<Partial<TestScenario>>) => {
      if (state.currentScenario) {
        state.currentScenario = { ...state.currentScenario, ...action.payload };
      }
    },
    clearCurrentScenario: (state) => {
      state.currentScenario = null;
    },
    updateExecutionStatus: (state, action: PayloadAction<Partial<TestExecution>>) => {
      if (state.currentExecution) {
        state.currentExecution = { ...state.currentExecution, ...action.payload };
      }
    },
    clearError: (state) => {
      state.error = null;
    },
    clearResults: (state) => {
      state.results = null;
    },
  },
  extraReducers: (builder) => {
    // Execute test
    builder
      .addCase(executeTest.pending, (state) => {
        state.loading.executing = true;
        state.error = null;
      })
      .addCase(executeTest.fulfilled, (state, action) => {
        state.loading.executing = false;
        state.currentExecution = {
          id: action.payload.executionId,
          status: action.payload.status,
          scenario: state.currentScenario?.content || '',
          url: state.currentScenario?.url || '',
          startTime: new Date().toISOString(),
          steps: [],
          screenshots: [],
          videos: [],
          securityFindings: [],
          metadata: {
            browser: 'chromium',
            viewport: '1280x720',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };
      })
      .addCase(executeTest.rejected, (state, action) => {
        state.loading.executing = false;
        state.error = action.error.message || 'Failed to execute test';
      });

    // Fetch execution status
    builder
      .addCase(fetchExecutionStatus.pending, (state) => {
        state.loading.fetching = true;
      })
      .addCase(fetchExecutionStatus.fulfilled, (state, action) => {
        state.loading.fetching = false;
        if (state.currentExecution) {
          state.currentExecution = { ...state.currentExecution, ...action.payload };
        }
      })
      .addCase(fetchExecutionStatus.rejected, (state, action) => {
        state.loading.fetching = false;
        state.error = action.error.message || 'Failed to fetch execution status';
      });

    // Fetch execution results
    builder
      .addCase(fetchExecutionResults.pending, (state) => {
        state.loading.fetching = true;
      })
      .addCase(fetchExecutionResults.fulfilled, (state, action) => {
        state.loading.fetching = false;
        state.results = action.payload;
      })
      .addCase(fetchExecutionResults.rejected, (state, action) => {
        state.loading.fetching = false;
        state.error = action.error.message || 'Failed to fetch execution results';
      });

    // Stop execution
    builder
      .addCase(stopExecution.pending, (state) => {
        state.loading.stopping = true;
      })
      .addCase(stopExecution.fulfilled, (state) => {
        state.loading.stopping = false;
        if (state.currentExecution) {
          state.currentExecution.status = 'stopped';
          state.currentExecution.endTime = new Date().toISOString();
        }
      })
      .addCase(stopExecution.rejected, (state, action) => {
        state.loading.stopping = false;
        state.error = action.error.message || 'Failed to stop execution';
      });

    // Fetch execution history
    builder
      .addCase(fetchExecutionHistory.pending, (state) => {
        state.loading.fetching = true;
      })
      .addCase(fetchExecutionHistory.fulfilled, (state, action) => {
        state.loading.fetching = false;
        state.history = action.payload.executions || [];
      })
      .addCase(fetchExecutionHistory.rejected, (state, action) => {
        state.loading.fetching = false;
        state.error = action.error.message || 'Failed to fetch execution history';
      });
  },
});

export const {
  setCurrentScenario,
  updateCurrentScenario,
  clearCurrentScenario,
  updateExecutionStatus,
  clearError,
  clearResults,
} = testSlice.actions;

export default testSlice.reducer;