import { useState } from 'react';
import { Video, Lock, User, AlertCircle } from 'lucide-react';
import { api, setToken } from "../api/apiHelper";

interface LoginPageProps {
  onLogin: (user: any) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const r = await api<{ token: string; user: any }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      setToken(r.token);
      onLogin(r.user);
    } catch (err: any) {
      setError(err?.message || "Login failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
      
      {/* Login Card */}
      <div className="relative w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-white text-3xl mb-2">SecureWatch</h1>
          <p className="text-slate-400">CCTV Monitoring System</p>
        </div>

        {/* Login Form */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-8">
          <h2 className="text-white text-xl mb-6">Sign In</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-slate-300 text-sm mb-2">
                Username/Email
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Enter username/email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-slate-300 text-sm mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Lock className="w-5 h-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Demo Credentials Info */}
          <div className="mt-6 pt-6 border-t border-slate-800">
            <p className="text-slate-500 text-sm text-center mb-2">Demo Credentials:</p>
            <div className="bg-slate-800/30 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Username:</span>
                <span className="text-slate-300">admin</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Password:</span>
                <span className="text-slate-300">user1234</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-slate-500 text-sm">
            &copy; 2024 SecureWatch. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
