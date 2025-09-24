import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

import testSlice from './slices/testSlice';
import uiSlice from './slices/uiSlice';
import authSlice from './slices/authSlice';
import websocketSlice from './slices/websocketSlice';

export const store = configureStore({
  reducer: {
    test: testSlice,
    ui: uiSlice,
    auth: authSlice,
    websocket: websocketSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['websocket/messageReceived'],
        ignoredPaths: ['websocket.connection'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;