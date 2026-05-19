/**
 * QuestMind 统一认证服务
 * 使用 Supabase Auth 原生认证
 * 支持：邮箱登录、邮箱注册
 */

import { supabase } from './supabase';
import { initUserData as initializeUserData } from './syncService';

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email?: string;
    nickname?: string;
  };
  error?: string;
}

/**
 * 邮箱登录
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data.user) {
      // 确保用户数据存在于数据库
      await ensureUserInDatabase(data.user.id, data.user.email);

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email || undefined,
        },
      };
    }

    return { success: false, error: '登录失败' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 邮箱注册
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  nickname?: string
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: nickname || '学习新手',
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data.user) {
      // 初始化用户数据
      await initializeUserData(
        data.user.id,
        data.user.email || '',
        nickname || '学习新手'
      );

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email || undefined,
          nickname: nickname || '学习新手',
        },
      };
    }

    return { success: false, error: '注册失败' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 发送重置密码邮件
 */
export async function sendPasswordResetEmail(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 退出登录
 */
export async function signOut(): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 获取当前会话
 */
export async function getCurrentSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      return { session: null, error: error.message };
    }

    return { session: data.session, error: null };
  } catch (err: any) {
    return { session: null, error: err.message };
  }
}

/**
 * 获取当前用户
 */
export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (err: any) {
    return { user: null, error: err.message };
  }
}

/**
 * 监听认证状态变化
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * 确保用户存在于数据库（如果不存在则创建）
 */
async function ensureUserInDatabase(authId: string, email?: string) {
  try {
    // 检查用户是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authId)
      .single();

    if (!existingUser) {
      // 用户不存在，创建新用户记录
      await initializeUserData(authId, email || '', '学习新手');
    }
  } catch (err) {
    console.error('确保用户存在于数据库失败:', err);
  }
}

/**
 * 更新用户昵称
 */
export async function updateNickname(nickname: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.updateUser({
      data: { nickname },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // 同步更新数据库
    if (data.user) {
      await supabase
        .from('users')
        .update({ nickname })
        .eq('auth_id', data.user.id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
