import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { userApi, User } from '../services/api';

interface UserState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

const storedToken = localStorage.getItem('token');
const storedUser = readStoredUser();

function readStoredUser(): User | null {
  try {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return null;
    return JSON.parse(storedUser) as User;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

const initialState: UserState = {
  user: storedToken ? storedUser : null,
  token: storedToken,
  isLoading: false,
  error: null,
};

const clearStoredAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('wel_tok');
  sessionStorage.removeItem('xf_show_profile');
};

function getAuthErrorMessage(error: any, fallback: string): string {
  const data = error?.response?.data;
  const message = data?.error || data?.message || error?.message || fallback;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

// 异步 thunk
export const login = createAsyncThunk(
  'user/login',
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await userApi.login(username, password);
      const { token, user, welToken } = response.data;
      localStorage.setItem('token', token);
      if (welToken) {
        localStorage.setItem('wel_tok', welToken);
      }
      localStorage.setItem('user', JSON.stringify(user));
      return { token, user };
    } catch (error) {
      return rejectWithValue(getAuthErrorMessage(error, "登录失败"));
    }
  }
);

export const loginByMobile = createAsyncThunk(
  "user/loginByMobile",
  async ({ mobile, code, inviteCode }: { mobile: string; code: string; inviteCode?: string }, { rejectWithValue }) => {
    try {
      const response = await userApi.mobileAuth(mobile, code, inviteCode);
      const { token, user, welToken } = response.data;
      localStorage.setItem("token", token);
      if (welToken) {
        localStorage.setItem("wel_tok", welToken);
      }
      localStorage.setItem("user", JSON.stringify(user));
      return { token, user };
    } catch (error) {
      return rejectWithValue(getAuthErrorMessage(error, "短信登录失败"));
    }
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
      clearStoredAuth();
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
        state.error = (action.payload as string) || action.error.message || '登录失败';
      })
      .addCase(loginByMobile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginByMobile.fulfilled, (state, action: PayloadAction<{ token: string; user: User }>) => {
        state.isLoading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
      })
      .addCase(loginByMobile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || action.error.message || "短信登录失败";
      })
      .addCase(fetchMe.fulfilled, (state, action: PayloadAction<User>) => {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      });
  },
});

export const { logout, clearError, updateUser } = userSlice.actions;
export default userSlice.reducer;
