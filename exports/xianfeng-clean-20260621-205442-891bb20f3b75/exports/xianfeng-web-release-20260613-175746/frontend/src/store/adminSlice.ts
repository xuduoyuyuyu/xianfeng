import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { User } from '../services/api';

interface AdminState {
  admin: User | null;
  adminToken: string | null;
  isLoading: boolean;
  error: string | null;
}

const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_USER_KEY = 'admin_user';

const initialState: AdminState = {
  admin: JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || 'null'),
  adminToken: localStorage.getItem(ADMIN_TOKEN_KEY),
  isLoading: false,
  error: null,
};

export const adminLogin = createAsyncThunk(
  'admin/login',
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';
      const resp = await axios.post(`${API_BASE_URL}/api/users/login`, { username, password });
      const { token, user } = resp.data;
      if (user.role !== 'admin') {
        return rejectWithValue('该账号不是管理员，请使用管理员账号登录');
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      return { token, admin: user };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '登录失败';
      return rejectWithValue(msg);
    }
  }
);

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    adminLogout: (state) => {
      state.admin = null;
      state.adminToken = null;
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_USER_KEY);
    },
    clearAdminError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(adminLogin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(adminLogin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.adminToken = action.payload.token;
        state.admin = action.payload.admin;
      })
      .addCase(adminLogin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || '登录失败';
      });
  },
});

export const { adminLogout, clearAdminError } = adminSlice.actions;
export default adminSlice.reducer;
