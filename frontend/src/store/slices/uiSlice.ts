import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  loading: {
    global: boolean;
    page: boolean;
  };
  notifications: Notification[];
  modals: {
    settings: boolean;
    help: boolean;
    about: boolean;
  };
  layout: {
    leftPanelWidth: number;
    rightPanelWidth: number;
    bottomPanelHeight: number;
  };
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  persistent?: boolean;
}

const initialState: UIState = {
  theme: 'light',
  sidebarOpen: true,
  loading: {
    global: false,
    page: false,
  },
  notifications: [],
  modals: {
    settings: false,
    help: false,
    about: false,
  },
  layout: {
    leftPanelWidth: 320,
    rightPanelWidth: 400,
    bottomPanelHeight: 300,
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.global = action.payload;
    },
    setPageLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.page = action.payload;
    },
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp' | 'read'>>) => {
      const notification: Notification = {
        ...action.payload,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        read: false,
      };
      state.notifications.unshift(notification);

      // Limit to 50 notifications
      if (state.notifications.length > 50) {
        state.notifications = state.notifications.slice(0, 50);
      }
    },
    markNotificationRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification) {
        notification.read = true;
      }
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    markAllNotificationsRead: (state) => {
      state.notifications.forEach(notification => {
        notification.read = true;
      });
    },
    openModal: (state, action: PayloadAction<keyof UIState['modals']>) => {
      state.modals[action.payload] = true;
    },
    closeModal: (state, action: PayloadAction<keyof UIState['modals']>) => {
      state.modals[action.payload] = false;
    },
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach((key) => {
        state.modals[key as keyof UIState['modals']] = false;
      });
    },
    updateLayout: (state, action: PayloadAction<Partial<UIState['layout']>>) => {
      state.layout = { ...state.layout, ...action.payload };
    },
    resetLayout: (state) => {
      state.layout = initialState.layout;
    },
  },
});

export const {
  setTheme,
  toggleSidebar,
  setSidebarOpen,
  setGlobalLoading,
  setPageLoading,
  addNotification,
  markNotificationRead,
  removeNotification,
  clearNotifications,
  markAllNotificationsRead,
  openModal,
  closeModal,
  closeAllModals,
  updateLayout,
  resetLayout,
} = uiSlice.actions;

export default uiSlice.reducer;