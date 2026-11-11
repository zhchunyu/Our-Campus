import { useCallback, useEffect, useRef, useState } from 'react'
import { describeServerError, requireSupabase, supabase } from '../../data/supabaseClient.js'
import { PROFILE_COLUMNS, saveProfileAvatar } from '../../data/memberProfiles.js'

const authLink = new URLSearchParams(window.location.hash.slice(1))
const startsInRecovery = authLink.get('type') === 'recovery' && Boolean(authLink.get('access_token'))

function expiredProfileRequest() {
  const error = new Error('账号状态已变化，请重新操作')
  error.name = 'AbortError'
  return error
}

function isOlderProfile(next, current) {
  if (!current || current.user_id !== next.user_id) return false
  const currentTime = Date.parse(current.updated_at)
  const nextTime = Date.parse(next.updated_at)
  if (!Number.isFinite(currentTime)) return false
  if (!Number.isFinite(nextTime) || nextTime < currentTime) return true
  if (nextTime !== currentTime) return false
  const fraction = (value) => String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1].padEnd(9, '0') ?? '000000000'
  return fraction(next.updated_at) < fraction(current.updated_at)
}

export function useCampusAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [role, setRole] = useState('visitor')
  const [status, setStatus] = useState(supabase ? 'loading' : 'unconfigured')
  const [error, setError] = useState('')
  const [recoveryRequested, setRecoveryRequested] = useState(startsInRecovery)
  const userId = session?.user?.id ?? null
  const ownerRef = useRef(null)
  const ownerVersionRef = useRef(0)
  const profileRequestRef = useRef(0)
  const mutationVersionRef = useRef(0)
  const latestProfileRef = useRef(null)
  const ownerVersion = ownerVersionRef.current

  const acceptProfile = useCallback((next) => {
    if (!next || next.user_id !== ownerRef.current || isOlderProfile(next, latestProfileRef.current)) return
    latestProfileRef.current = next
    setProfile(next)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let disposed = false
    let eventReceived = false
    const acceptSession = (nextSession) => {
      const nextOwner = nextSession?.user?.id ?? null
      if (ownerRef.current !== nextOwner) {
        // Invalidate work inside the auth event, before React renders the new account.
        ownerRef.current = nextOwner
        ownerVersionRef.current++
        profileRequestRef.current++
        mutationVersionRef.current++
        latestProfileRef.current = null
        setProfile(null)
        setRole('visitor')
      }
      setSession(nextSession)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (disposed) return
      eventReceived = true
      acceptSession(nextSession)
      setStatus('ready')
      setError('')
      if (event === 'PASSWORD_RECOVERY') setRecoveryRequested(true)
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (disposed || eventReceived) return
      if (sessionError) {
        setError(describeServerError(sessionError, '登录状态恢复失败，请重新登录'))
        setStatus('error')
      } else {
        acceptSession(data.session)
        setStatus('ready')
      }
    }).catch(() => {
      if (!disposed && !eventReceived) {
        setError('网络连接失败，请重新登录')
        setStatus('error')
      }
    })
    return () => {
      disposed = true
      ownerRef.current = null
      ownerVersionRef.current++
      profileRequestRef.current++
      mutationVersionRef.current++
      subscription.unsubscribe()
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!supabase || !userId || ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion) return
    const requestVersion = ++profileRequestRef.current
    const mutationVersion = mutationVersionRef.current
    const [profileResult, roleResult] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).single(),
      supabase.rpc('campus_my_role'),
    ])
    if (ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion || profileRequestRef.current !== requestVersion || mutationVersionRef.current !== mutationVersion) return
    setRole(!roleResult.error && ['student', 'manager'].includes(roleResult.data) ? roleResult.data : 'visitor')
    if (profileResult.error || roleResult.error) {
      setError(describeServerError(profileResult.error ?? roleResult.error, '个人资料加载失败，请重试'))
      return
    }
    acceptProfile(profileResult.data)
    setError('')
  }, [userId, ownerVersion, acceptProfile])

  useEffect(() => {
    setProfile(null)
    latestProfileRef.current = null
    setRole('visitor')
    if (userId) refreshProfile().catch(() => {
      if (ownerRef.current === userId && ownerVersionRef.current === ownerVersion) setError('个人资料加载失败，请检查网络')
    })
  }, [userId, ownerVersion, refreshProfile])

  useEffect(() => {
    if (!supabase || !userId || ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion) return undefined
    let disposed = false
    const syncProfile = () => {
      if (disposed || ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion || document.visibilityState === 'hidden') return
      // A failed background read retains the last confirmed profile; later events retry.
      refreshProfile().catch(() => {})
    }
    const channel = supabase.channel(`owner-profile-${userId}-${ownerVersion}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.new?.user_id === userId) syncProfile()
      })
      .subscribe((connectionStatus) => { if (connectionStatus === 'SUBSCRIBED') syncProfile() })
    const interval = setInterval(syncProfile, 30000)
    window.addEventListener('online', syncProfile)
    document.addEventListener('visibilitychange', syncProfile)
    return () => {
      disposed = true
      clearInterval(interval)
      window.removeEventListener('online', syncProfile)
      document.removeEventListener('visibilitychange', syncProfile)
      Promise.resolve(supabase.removeChannel(channel)).catch(() => {})
    }
  }, [userId, ownerVersion, refreshProfile])

  const login = async ({ email, password }) => {
    const { data, error: authError } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (authError) throw authError
    return data
  }
  const register = async ({ email, password, nickname }) => {
    const { data, error: authError } = await requireSupabase().auth.signUp({
      email: email.trim(), password, options: { data: { nickname: nickname.trim() } },
    })
    if (authError) throw authError
    return data
  }
  const confirmEmail = async ({ email, token, type = 'email' }) => {
    const { data, error: authError } = await requireSupabase().auth.verifyOtp({ email: email.trim(), token: token.trim(), type })
    if (authError) throw authError
    if (type === 'recovery') setRecoveryRequested(true)
    return data
  }
  const resendConfirmation = async (email) => {
    const { error: authError } = await requireSupabase().auth.resend({ type: 'signup', email: email.trim() })
    if (authError) throw authError
  }
  const requestPasswordReset = async (email) => {
    const { error: authError } = await requireSupabase().auth.resetPasswordForEmail(email.trim())
    if (authError) throw authError
  }
  const updatePassword = async (password) => {
    const { error: authError } = await requireSupabase().auth.updateUser({ password })
    if (authError) throw authError
    setRecoveryRequested(false)
  }
  const logout = async () => {
    const { error: authError } = await requireSupabase().auth.signOut({ scope: 'local' })
    if (authError) throw authError
    ownerRef.current = null
    ownerVersionRef.current++
    profileRequestRef.current++
    mutationVersionRef.current++
    latestProfileRef.current = null
    setSession(null)
    setProfile(null)
    setRole('visitor')
    setRecoveryRequested(false)
  }
  const updateNickname = async (nickname) => {
    const value = nickname.trim()
    if (!value || [...value].length > 40) throw new Error('昵称请填写 1–40 个字')
    if (!userId) throw new Error('请先登录后修改昵称')
    if (ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion) throw expiredProfileRequest()
    const mutationVersion = ++mutationVersionRef.current
    profileRequestRef.current++
    const { data, error: profileError } = await requireSupabase().from('profiles')
      .update({ nickname: value }).eq('user_id', userId).select(PROFILE_COLUMNS).single()
    if (ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion || mutationVersionRef.current !== mutationVersion) throw expiredProfileRequest()
    if (profileError) throw profileError
    profileRequestRef.current++
    acceptProfile(data)
  }
  const updateAvatar = async (image) => {
    if (!userId) throw new Error('请先登录后同步头像')
    if (ownerRef.current !== userId || ownerVersionRef.current !== ownerVersion) throw expiredProfileRequest()
    const mutationVersion = ++mutationVersionRef.current
    profileRequestRef.current++
    const isCurrent = () => ownerRef.current === userId && ownerVersionRef.current === ownerVersion && mutationVersionRef.current === mutationVersion
    const data = await saveProfileAvatar({ userId, image, isCurrent })
    if (!isCurrent()) throw expiredProfileRequest()
    profileRequestRef.current++
    acceptProfile(data)
    return data
  }

  return {
    user: session?.user ?? null,
    profile: profile?.user_id === userId ? profile : null,
    role: profile?.user_id === userId ? role : 'visitor',
    status, error, recoveryRequested,
    login, register, confirmEmail, resendConfirmation, requestPasswordReset,
    updatePassword, logout, updateNickname, updateAvatar, refreshProfile,
  }
}
