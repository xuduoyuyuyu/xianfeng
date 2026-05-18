import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { userApi, User } from '../services/api';

interface UserState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: UserState = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isLoading: false,
  error: null,
};

// 异步 thunk
export const login = createAsyncThunk(
  'user/login',
  async ({ username, password }: { username: string; password: string }) => {
    const response = await userApi.login(username, password);
    const { token, user, welToken } = response.data;
    localStorage.setItem('token', token);
    if (welToken) {
      localStorage.setItem('wel_tok', welToken);
    }
    localStorage.setItem('user', JSON.stringify(user));
    return { token, user };
  }
);

export const fetchMe = createAsyncThunk('user/fetchMe', async () => {
  const response = await userApi.getMe();
  return response.data;
});

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action: PayloadAction<Partial<User & { avatar_image?: string; grade?: string; name?: string; avatar_initial?: string }>>) => {
      if (state.user) {
        Object.assign(state.user, action.payload);
        localStorage.setItem('user', JSON.stringify(state.user));
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<{ token: string; user: User }>) => {
        state.isLoading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || '登录失败';
      })
      .addCase(fetchMe.fulfilled, (state, action: PayloadAction<User>) => {
        state.user = action.payload;
      });
  },
});

export const { logout, clearError, updateUser } = userSlice.actions;
export default userSlice.reducer;
