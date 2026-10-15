import { useState } from 'react'
import { store } from '../lib/store'
import { ThemeToggle, Wordmark } from '../components/ui'

export default function Auth({ error, onAuthenticated, onSignOut }: {
  error: string | null
  onAuthenticated: () => Promise<void>
  onSignOut: () => Promise<void>
}) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'up'
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError(null)
    try {
      if (signingUp) {
        const result = await store.signUp(email.trim(), password, name.trim())
        if (result.needsConfirmation) { setSent(true); setPassword(''); return }
      } else await store.signIn(email.trim(), password)
      await onAuthenticated()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not sign in. Please try again.')
    } finally { setBusy(false) }
  }
  return (
    <main className="auth-page">
      <div className="signin">
        <div className="signin-top"><Wordmark subtitle="" /><ThemeToggle /></div>
        <div className="signin-body">
          <header className="stack">
            <h1>{sent ? 'Check your email' : signingUp ? 'Create an account' : 'Sign in'}</h1>
            <p className="lead">{sent ? `Open the confirmation link sent to ${email}, then sign in.` : 'Sign in to view homework, class news and shared files.'}</p>
          </header>
          {store.mode === 'demo' && <p className="alert" role="status">Sign in is not configured. An administrator needs to connect Supabase. No class data is available here.</p>}
          {error && <div className="alert error" role="alert"><p>{error}</p><button className="link-btn" onClick={() => { void onSignOut() }}>Retry sign out</button></div>}
          {sent ? <button className="btn-primary" onClick={() => { setSent(false); setMode('in') }}>Back to sign in</button> : (
            <form className="signin-card" onSubmit={submit} aria-busy={busy}>
              <fieldset disabled={busy || store.mode === 'demo'} className="auth-fields">
                <legend className="sr-only">{signingUp ? 'Sign up details' : 'Sign in details'}</legend>
                <div className="seg seg-2" role="group" aria-label="Choose sign in or sign up">
                  <button type="button" aria-pressed={!signingUp} className={!signingUp ? 'on' : ''} onClick={() => { setMode('in'); setFormError(null) }}>Sign in</button>
                  <button type="button" aria-pressed={signingUp} className={signingUp ? 'on' : ''} onClick={() => { setMode('up'); setFormError(null) }}>Sign up</button>
                </div>
                {signingUp && <label className="field"><span className="field-label">Your name</span><input autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} required /></label>}
                <label className="field"><span className="field-label">Email</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
                <label className="field"><span className="field-label">Password</span><input type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />{signingUp && <span className="small muted">At least six characters. New accounts start as Readers.</span>}</label>
                {formError && <div className="alert error" role="alert">{formError}</div>}
                <button className="btn-primary" type="submit">{busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}</button>
              </fieldset>
            </form>
          )}
          <p className="small muted">Registration is open. Only an administrator can grant Editor or Admin permissions.</p>
        </div>
      </div>
    </main>
  )
}
