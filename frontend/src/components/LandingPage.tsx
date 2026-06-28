import { API_URL } from '../config';
import React, { useState } from 'react';
import { MessageCircle, Mic, Video, Users, Clock, Shield, LogOut } from 'lucide-react';
import { useAuthStore } from '../store';
import toast from 'react-hot-toast';
import { GoogleLogin } from '@react-oauth/google';
import { CompleteProfileModal } from './CompleteProfileModal';

export const LandingPage = ({ onStart }: { onStart: (type?: 'random_text' | 'random_video' | 'random_voice', tags?: string[]) => void }) => {
  const { user, token, login, logout } = useAuthStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [tagsInput, setTagsInput] = useState('');

  const [googleData, setGoogleData] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [regUsername, setRegUsername] = useState('');
  const [regDob, setRegDob] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoadingOtp, setIsLoadingOtp] = useState(false);
  const [useOtpLogin, setUseOtpLogin] = useState(false);

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const handleGuestStart = async (type: 'random_text' | 'random_video' | 'random_voice' = 'random_text') => {
    const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (token && user) {
      onStart(type, tags);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/auth/guest`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        login(data.token, data.user);
        onStart(type, tags);
      } else {
        toast.error("Failed to start guest session.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Cannot connect to server.");
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      const res = await fetch(`${API_URL}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });
      const data = await res.json();
      
      if (data.success) {
        if (data.isNewUser) {
          setShowAuthModal(false);
          setGoogleData(data.googleData);
        } else {
          login(data.token, data.user);
          setShowAuthModal(false);
        }
      } else {
        toast.error(data.error || "Google authentication failed");
      }
    } catch (e) {
      toast.error("Cannot connect to server.");
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToUse = authMode === 'login' ? emailInput : regEmail;
    if (!emailToUse) return;
    setIsLoadingOtp(true);
    try {
      const res = await fetch(`${API_URL}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse })
      });
      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
        toast.success("Code sent to your email!");
      } else {
        toast.error(data.error || "Failed to send code");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsLoadingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput) return;
    setIsLoadingOtp(true);
    try {
      const res = await fetch(`${API_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, code: otpInput })
      });
      const data = await res.json();
      if (data.success) {
        if (data.isNewUser) {
          setShowAuthModal(false);
          setGoogleData({ email: data.email, picture: '' }); // Show complete profile modal
        } else {
          login(data.token, data.user);
          setShowAuthModal(false);
        }
      } else {
        toast.error(data.error || "Invalid code");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsLoadingOtp(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput) return;
    setIsLoadingOtp(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: regEmail, 
          username: regUsername, 
          password: regPassword, 
          date_of_birth: regDob,
          otp: otpInput
        })
      });
      const data = await res.json();
      if (data.success) {
        login(data.token, data.user);
        setShowAuthModal(false);
      } else {
        toast.error(data.error || "Registration failed");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsLoadingOtp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword })
      });
      const data = await res.json();
      if (data.success) {
        login(data.token, data.user);
        setShowAuthModal(false);
      } else {
        toast.error(data.error || "Login failed");
      }
    } catch (error) {
      toast.error("Network error");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] font-sans relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* HEADER NAV */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center max-w-6xl z-20">
        <div className="text-2xl font-bold font-mono tracking-tighter text-[var(--color-text-primary)]">
          Peerly<span className="text-[var(--color-accent)]">.</span>
        </div>
        <div className="flex gap-4 items-center">
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-[var(--color-text-secondary)] font-mono">@{user.username}</span>
              <button onClick={logout} className="text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => { setAuthMode('login'); setShowAuthModal(true); }} className="text-[var(--color-text-secondary)] hover:text-white font-medium">Log In</button>
              <button onClick={() => { setAuthMode('register'); setShowAuthModal(true); }} className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] px-4 py-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors font-medium">Sign Up</button>
            </>
          )}
        </div>
      </div>

      {/* Background Arc */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-[var(--color-accent-muted)] rounded-full opacity-20 pointer-events-none" />
      
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10 mt-16">
        
        {/* HERO CELL */}
        <div className="col-span-1 md:col-span-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 md:p-12 flex flex-col justify-center">
          <h1 className="text-4xl md:text-[56px] font-bold leading-tight mb-4 tracking-tight">
            Talk to the world.<br/>
            <span className="text-[var(--color-accent)]">No strings.</span>
          </h1>
          <p className="text-[var(--color-text-secondary)] text-lg mb-8 max-w-md">
            Connect instantly with strangers. Random text, voice, or video chat with zero login required.
          </p>
          
          <div className="flex gap-4 mb-8 flex-wrap">
            <button className="flex items-center gap-2 bg-[var(--color-surface-raised)] px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">
              <MessageCircle size={18} className="text-[var(--color-accent)]" /> Text
            </button>
            <button className="flex items-center gap-2 bg-[var(--color-surface-raised)] px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">
              <Mic size={18} className="text-[var(--color-accent)]" /> Voice
            </button>
            <button className="flex items-center gap-2 bg-[var(--color-surface-raised)] px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">
              <Video size={18} className="text-[var(--color-accent)]" /> Video
            </button>
          </div>

          <div className="flex flex-col gap-3 w-full md:w-auto self-start">
            <input 
              type="text" 
              placeholder="Interests (optional, comma-separated)" 
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-lg px-4 py-3 outline-none text-sm w-full md:min-w-[280px]"
            />
            <div className="flex gap-2">
              <button 
                onClick={() => handleGuestStart('random_text')}
                className="bg-[var(--color-accent)] text-[var(--color-bg)] font-semibold px-6 py-4 rounded-lg hover:bg-[#33dfff] transition-colors w-full md:w-auto text-lg flex-1"
              >
                Text Chat
              </button>
              <button 
                onClick={() => handleGuestStart('random_voice')}
                className="bg-[var(--color-surface-raised)] border border-[var(--color-accent)] text-[var(--color-text-primary)] font-semibold px-6 py-4 rounded-lg hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] transition-colors w-full md:w-auto text-lg flex-1"
              >
                Voice Chat
              </button>
              <button 
                onClick={() => handleGuestStart('random_video')}
                className="bg-[var(--color-surface-raised)] border border-[var(--color-accent)] text-[var(--color-text-primary)] font-semibold px-6 py-4 rounded-lg hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] transition-colors w-full md:w-auto text-lg flex-1"
              >
                Video Chat
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-1 md:col-span-4 flex flex-col gap-6">
          <div className="flex gap-6">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex-1">
              <Users size={24} className="text-[var(--color-accent)] mb-2" />
              <div className="text-2xl font-bold">12,400</div>
              <div className="text-[var(--color-text-secondary)] text-sm">online right now</div>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex-1">
              <Clock size={24} className="text-[var(--color-accent)] mb-2" />
              <div className="text-2xl font-bold">9 min</div>
              <div className="text-[var(--color-text-secondary)] text-sm">avg session</div>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex-1">
            <Shield size={24} className="text-[var(--color-success)] mb-4" />
            <h3 className="text-xl font-semibold mb-2">Private by Design</h3>
            <p className="text-[var(--color-text-secondary)] text-sm">
              No signup. No tracking. End-to-end anonymity. Your conversations vanish when you leave.
            </p>
          </div>
        </div>
      </div>

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 max-w-md w-full relative">
            <button onClick={() => { setShowAuthModal(false); setOtpSent(false); }} className="absolute top-4 right-4 text-[var(--color-text-secondary)] hover:text-white">✕</button>
            <h2 className="text-2xl font-bold mb-6">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            
            {authMode === 'login' ? (
              <>
                {!useOtpLogin ? (
                  <form onSubmit={handleLogin} className="flex flex-col gap-4 mb-6">
                    <input required type="text" placeholder="Username or Email" value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" />
                    <input required type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" />
                    <button type="submit" className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-3 rounded-lg mt-2 hover:bg-[#33dfff] transition-colors">
                      Log In
                    </button>
                    <button type="button" onClick={() => setUseOtpLogin(true)} className="text-[var(--color-text-secondary)] text-sm mt-2 hover:text-white">
                      Login without password (Email OTP)
                    </button>
                  </form>
                ) : (
                  <>
                    {!otpSent ? (
                      <form onSubmit={handleSendOtp} className="flex flex-col gap-4 mb-6">
                        <input 
                          required 
                          type="email" 
                          placeholder="Enter your email" 
                          value={emailInput} 
                          onChange={e => setEmailInput(e.target.value)} 
                          className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" 
                        />
                        <button 
                          type="submit" 
                          disabled={isLoadingOtp}
                          className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-3 rounded-lg hover:bg-[#33dfff] transition-colors disabled:opacity-50"
                        >
                          {isLoadingOtp ? 'Sending...' : 'Send Login Code'}
                        </button>
                        <button type="button" onClick={() => setUseOtpLogin(false)} className="text-[var(--color-text-secondary)] text-sm mt-2 hover:text-white">
                          Use password instead
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 mb-6">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-2">Code sent to {emailInput}</div>
                        <input 
                          required 
                          type="text" 
                          placeholder="Enter 6-digit code" 
                          value={otpInput} 
                          onChange={e => setOtpInput(e.target.value)} 
                          className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full text-center tracking-widest font-mono text-lg" 
                          maxLength={6}
                        />
                        <button 
                          type="submit" 
                          disabled={isLoadingOtp}
                          className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-3 rounded-lg hover:bg-[#33dfff] transition-colors disabled:opacity-50"
                        >
                          {isLoadingOtp ? 'Verifying...' : 'Verify Code'}
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setOtpSent(false)} 
                          className="text-[var(--color-text-secondary)] text-sm hover:text-white"
                        >
                          Use a different email
                        </button>
                      </form>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="flex flex-col gap-4 mb-6">
                    <input required type="text" placeholder="Username" value={regUsername} onChange={e => setRegUsername(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" />
                    <div className="relative w-full">
                      <input required type="date" value={regDob} onChange={e => setRegDob(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full [&::-webkit-calendar-picker-indicator]:invert" />
                    </div>
                    <input required type="email" placeholder="Email Address" value={regEmail} onChange={e => setRegEmail(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" />
                    <input required type="password" placeholder="Password" value={regPassword} onChange={e => setRegPassword(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" />
                    
                    <button type="submit" disabled={isLoadingOtp} className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-3 rounded-lg mt-2 hover:bg-[#33dfff] transition-colors disabled:opacity-50">
                      {isLoadingOtp ? 'Sending Code...' : 'Sign Up'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="flex flex-col gap-4 mb-6">
                    <div className="text-sm text-[var(--color-text-secondary)] mb-2">Code sent to {regEmail}</div>
                    <input 
                      required 
                      type="text" 
                      placeholder="Enter 6-digit code" 
                      value={otpInput} 
                      onChange={e => setOtpInput(e.target.value)} 
                      className="bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 rounded-lg outline-none focus:border-[var(--color-accent)] w-full text-center tracking-widest font-mono text-lg" 
                      maxLength={6}
                    />
                    <button 
                      type="submit" 
                      disabled={isLoadingOtp}
                      className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-3 rounded-lg hover:bg-[#33dfff] transition-colors disabled:opacity-50"
                    >
                      {isLoadingOtp ? 'Verifying...' : 'Verify & Create Account'}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setOtpSent(false)} 
                      className="text-[var(--color-text-secondary)] text-sm hover:text-white"
                    >
                      Edit details
                    </button>
                  </form>
                )}
              </>
            )}

            <div className="flex items-center gap-4 my-6">
              <div className="h-px bg-[var(--color-border)] flex-1"></div>
              <div className="text-[var(--color-text-secondary)] text-sm">or connect with</div>
              <div className="h-px bg-[var(--color-border)] flex-1"></div>
            </div>

            <div className="flex justify-center w-full mt-4">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {
                  toast.error('Google Login Failed');
                }}
                theme="filled_black"
                shape="rectangular"
                width="100%"
                text={authMode === 'login' ? 'continue_with' : 'signup_with'}
              />
            </div>
          </div>
        </div>
      )}

      {googleData && (
        <CompleteProfileModal
          googleData={googleData}
          onCancel={() => setGoogleData(null)}
          onComplete={(token, user) => {
            login(token, user);
            setGoogleData(null);
          }}
        />
      )}
    </div>
  );
};
