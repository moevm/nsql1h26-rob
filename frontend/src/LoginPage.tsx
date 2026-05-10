import React, { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiPost, getAuthToken, setAuthRole, setAuthToken, setAuthUsername } from './apiCrud';
import { ROUTES } from './routes/paths';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const doLogin = useCallback(async () => {
    setLoginErr(null);
    setLoginBusy(true);
    try {
      const res = await apiPost('/api/auth/login', { username: loginUser.trim(), password: loginPass });
      const t = typeof res.access_token === 'string' ? res.access_token : '';
      if (!t) {
        throw new Error('No access_token returned');
      }
      const role = typeof res.role === 'string' ? res.role : null;
      const uname = typeof res.username === 'string' ? res.username : null;
      setAuthRole(role);
      setAuthUsername(uname);
      setAuthToken(t);
      navigate(ROUTES.dashboard, { replace: true });
    } catch (e) {
      setAuthRole(null);
      setAuthUsername(null);
      setAuthToken(null);
      setLoginErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginBusy(false);
    }
  }, [loginUser, loginPass, navigate]);

  if (getAuthToken()) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-sm bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div>
          <div className="text-base font-semibold text-slate-100">Sign in</div>
        </div>
        {loginErr && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{loginErr}</div>
        )}
        <label className="block">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5">username</span>
          <input
            className="bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5">password</span>
          <input
            type="password"
            className="bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-100 w-full"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doLogin();
            }}
          />
        </label>
        <button
          type="button"
          className="w-full text-xs px-3 py-2 rounded bg-[#137fec] text-white font-medium disabled:opacity-50"
          disabled={loginBusy}
          onClick={() => void doLogin()}
        >
          {loginBusy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
