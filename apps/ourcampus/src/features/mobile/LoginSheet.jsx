import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, KeyRound, Mail, UserRound, X } from 'lucide-react'
import { describeServerError } from '../../data/supabaseClient.js'

const EMPTY_FIELDS = { email: '', password: '', passwordAgain: '', nickname: '', token: '' }
const TITLES = { login: '欢迎回到校园', signup: '创建校园账号', confirm: '确认你的邮箱', forgot: '找回密码', reset: '设置新密码' }
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const isStrongPassword = (value) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)

export function LoginSheet({ onClose, auth, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const dialogRef = useRef(null)
  useBackLayer(true, () => { if (!busy) onClose() }, 100)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!dialogRef.current?.getAttribute('aria-busy')) onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => { window.removeEventListener('keydown', handleKeyDown); previouslyFocused?.focus?.() }
  }, [onClose])
  useEffect(() => { dialogRef.current?.querySelector('input')?.focus() }, [mode])
  useEffect(() => {
    if (auth.user && ['login', 'signup', 'confirm'].includes(mode) && !auth.recoveryRequested) onClose()
  }, [auth.user?.id, auth.recoveryRequested, mode, onClose])
  useEffect(() => {
    if (!cooldown) return undefined
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const updateField = (field) => (event) => {
    setFields((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setNotice('')
  }
  const switchMode = (next) => {
    if (busy) return
    setMode(next)
    setFields((current) => ({ ...EMPTY_FIELDS, email: current.email }))
    setErrors({})
    setNotice('')
  }
  const validate = () => {
    const next = {}
    if (!(mode === 'reset' && auth.recoveryRequested) && !isEmail(fields.email)) next.email = '请输入有效的邮箱地址'
    if (mode === 'login' && !fields.password) next.password = '请输入密码'
    if (mode === 'signup' || mode === 'reset') {
      if (!isStrongPassword(fields.password)) next.password = '至少 8 位，包含字母和数字'
      if (fields.passwordAgain !== fields.password) next.passwordAgain = '两次输入的密码不一致'
    }
    if (mode === 'signup' && (!fields.nickname.trim() || [...fields.nickname.trim()].length > 40)) next.nickname = '昵称请填写 1–40 个字'
    if ((mode === 'confirm' || (mode === 'reset' && !auth.recoveryRequested)) && !/^\d{6,10}$/.test(fields.token.trim())) next.token = '请输入邮件中的数字验证码'
    setErrors(next)
    return !Object.values(next).some(Boolean)
  }
  const submit = async (event) => {
    event.preventDefault()
    if (busy || !validate()) return
    setBusy(true)
    setNotice('')
    try {
      if (mode === 'login') {
        await auth.login(fields)
        onClose()
      } else if (mode === 'signup') {
        const result = await auth.register(fields)
        setFields((current) => ({ ...current, password: '', passwordAgain: '' }))
        if (result.session) onClose()
        else {
          setMode('confirm')
          setCooldown(60)
          setNotice('请查收注册验证码邮件，将邮件中的数字验证码填在下方。已有账号可直接返回登录。')
        }
      } else if (mode === 'confirm') {
        await auth.confirmEmail({ email: fields.email, token: fields.token })
        onClose()
      } else if (mode === 'forgot') {
        await auth.requestPasswordReset(fields.email)
        setMode('reset')
        setCooldown(60)
        setNotice('如果该邮箱已注册，会收到重置密码验证码邮件。填写数字验证码后设置新密码。')
      } else if (mode === 'reset') {
        if (!auth.recoveryRequested) await auth.confirmEmail({ email: fields.email, token: fields.token, type: 'recovery' })
        await auth.updatePassword(fields.password)
        onClose()
      }
    } catch (error) {
      setNotice(describeServerError(error, '操作未成功，请检查输入或稍后重试'))
    } finally { setBusy(false) }
  }
  const resend = async () => {
    if (busy || cooldown || !isEmail(fields.email)) return
    setBusy(true)
    try {
      if (mode === 'reset') await auth.requestPasswordReset(fields.email)
      else await auth.resendConfirmation(fields.email)
      setCooldown(60)
      setNotice('请求已提交，请检查邮箱与垃圾邮件。邮件服务有发送频率限制，请勿重复点击。')
    } catch (error) { setNotice(describeServerError(error, '邮件发送失败，请稍后重试')) }
    finally { setBusy(false) }
  }
  const field = (name, label, Icon, options = {}) => (
    <label className="mobile-login-field">
      <span><Icon size={15} /> {label}</span>
      <input {...options} value={fields[name]} onChange={updateField(name)} disabled={busy}
        aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `login-${name}-error` : undefined} />
      {errors[name] && <small id={`login-${name}-error`} role="alert">{errors[name]}</small>}
    </label>
  )
  const buttonText = { login: '登录', signup: '注册', confirm: '验证并登录', forgot: '发送重置邮件', reset: '保存新密码' }[mode]

  return createPortal(
    <div className="mobile-login-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
      <section className="mobile-login-sheet" ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby="mobile-login-title" aria-busy={busy ? 'true' : undefined}>
        <div className="mobile-login-sheet__handle" aria-hidden="true" />
        <header className="mobile-login-sheet__header">
          <div><span>OurCampus · 数字校园</span><h2 id="mobile-login-title">{TITLES[mode]}</h2></div>
          <button className="mobile-login-sheet__close" type="button" disabled={busy} onClick={onClose} aria-label="关闭登录窗口"><X size={19} /></button>
        </header>
        {['login', 'signup'].includes(mode) && <div className="mobile-login-methods" role="group" aria-label="账号操作">
          <button type="button" disabled={busy} className={mode === 'login' ? 'is-active' : ''} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>邮箱登录</button>
          <button type="button" disabled={busy} className={mode === 'signup' ? 'is-active' : ''} aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')}>注册账号</button>
        </div>}
        <form className="mobile-login-form" onSubmit={submit} noValidate>
          <div className="mobile-login-fields">
            {!(mode === 'reset' && auth.recoveryRequested) && field('email', '邮箱', Mail, { type: 'email', inputMode: 'email', autoComplete: 'email', placeholder: '输入你的常用邮箱', maxLength: 254, readOnly: ['confirm', 'reset'].includes(mode) })}
            {mode === 'signup' && field('nickname', '昵称', UserRound, { type: 'text', autoComplete: 'nickname', placeholder: '同学们会看到这个名字', maxLength: 40 })}
            {(mode === 'confirm' || (mode === 'reset' && !auth.recoveryRequested)) && field('token', '邮件验证码', KeyRound, { type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', placeholder: '填写邮件中的数字验证码', maxLength: 10 })}
            {['login', 'signup', 'reset'].includes(mode) && field('password', mode === 'reset' ? '新密码' : '密码', KeyRound, { type: 'password', autoComplete: mode === 'login' ? 'current-password' : 'new-password', placeholder: mode === 'login' ? '输入密码' : '至少 8 位，包含字母和数字', maxLength: 128 })}
            {['signup', 'reset'].includes(mode) && field('passwordAgain', '确认密码', KeyRound, { type: 'password', autoComplete: 'new-password', placeholder: '再次输入密码', maxLength: 128 })}
            {mode === 'login' && <button className="mobile-login-text-action" type="button" disabled={busy} onClick={() => switchMode('forgot')}>忘记密码？</button>}
            {['confirm', 'reset'].includes(mode) && !(mode === 'reset' && auth.recoveryRequested) && <button className="mobile-login-text-action" type="button" disabled={busy || cooldown > 0} onClick={resend}>{cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送邮件'}</button>}
          </div>
          {notice && <p className="mobile-login-notice" role="status">{notice}</p>}
          <button className="mobile-login-submit" type="submit" disabled={busy || auth.status === 'unconfigured'}>{busy ? '请稍候…' : buttonText} {!busy && <ArrowRight size={16} />}</button>
          {auth.status === 'unconfigured' && <p className="mobile-login-notice" role="alert">账号服务器尚未配置，请联系管理员。</p>}
        </form>
        <footer className="mobile-login-sheet__footer">
          <span>{mode === 'login' ? '还没有账号？' : mode === 'signup' ? '已有账号？' : '已确认邮箱或想换个邮箱？'}</span>
          <button type="button" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? '立即注册' : '返回登录'}</button>
        </footer>
      </section>
    </div>, document.body,
  )
}
import { useBackLayer } from '../../app/useBackLayer.js'
