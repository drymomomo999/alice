import type { User } from '@/types'

export function belongsToAccount(user: User | null, authId: string, email?: string): boolean {
  return !!user && (user.authId === authId || user.id === authId || (!user.authId && !!email && user.email?.toLowerCase() === email.toLowerCase()))
}

export function mergeUserProfile(remote: User, cached: User | null, pending: Partial<User> = {}): User {
  const sameAccount = !!cached && (
    cached.id === remote.id
    || (!!cached.authId && !!remote.authId && cached.authId === remote.authId)
    || (!!cached.email && !!remote.email && cached.email.toLowerCase() === remote.email.toLowerCase())
  )
  if (!cached || !sameAccount) return { ...remote, ...pending }
  return {
    ...cached, ...remote,
    nickname: remote.nickname || cached.nickname,
    avatar: remote.avatar || cached.avatar,
    timePreference: remote.timePreference || cached.timePreference,
    goalPreferences: remote.goalPreferences?.length ? remote.goalPreferences : cached.goalPreferences,
    city: remote.city || cached.city,
    onboardingCompleted: !!(remote.onboardingCompleted || cached.onboardingCompleted),
    ...pending,
  }
}
