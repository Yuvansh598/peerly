import { API_URL } from '../config';
import React, { useState } from 'react';
import { MessageCircle, Mic, Video, Users, Clock, Shield, LogOut } from 'lucide-react';
import { useAuthStore } from '../store';
import toast from 'react-hot-toast';
import { GoogleLogin } from '@react-oauth/google';
import { CompleteProfileModal } from './CompleteProfileModal';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { motion, AnimatePresence } from 'framer-motion';

export const LandingPage = ({ onStart }: { onStart: (type?: 'random_text' | 'random_video' | 'random_voice', tags?: string[]) => void }) => {
  const { user, login, logout } = useAuthStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [guestUsername, setGuestUsername] = useState('');

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
  const [countdown, setCountdown] = useState(0);

  React.useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleGuestStart = async (type: 'random_text' | 'random_video' | 'random_voice' = 'random_text') => {
    const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    
    // If username is supplied, validate client-side first
    if (guestUsername.trim()) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(guestUsername.trim())) {
        toast.error("Username must be 3-20 characters, containing only letters, numbers, or underscores.");
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}/auth/guest`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: guestUsername.trim() || undefined })
      });
      const data = await res.json();
      if (data.success) {
        login(data.token, data.user);
        onStart(type, tags);
      } else {
        toast.error(data.error || "Failed to start guest session.");
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
        setCountdown(60);
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
          setGoogleData({ email: data.email, picture: '' });
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
    <div className="min-h-screen bg-[#070913] text-[#f0f4ff] font-sans relative overflow-hidden flex flex-col items-center justify-between p-4 pb-8 md:p-8">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#00f0ff] to-[#0072ff] blur-[150px] animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#9d4edd] to-[#0072ff] blur-[150px] animate-pulse" />
      </div>

      {/* HEADER NAV */}
      <div className="w-full flex justify-between items-center max-w-6xl z-20 pt-2 pb-6">
        <div className="text-3xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[#00f0ff] to-[#0072ff]">
          Peerly<span className="text-white">.</span>
        </div>
        <div className="flex gap-4 items-center">
          {user ? (
            <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-full border border-white/5">
              <span className="text-gray-400 text-sm font-mono">@{user.username}</span>
              <button onClick={logout} className="text-gray-400 hover:text-[#ff4d6d] transition-colors cursor-pointer" title="Log Out">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="glass" size="sm" onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}>
                Log In
              </Button>
              <Button variant="primary" size="sm" onClick={() => { setAuthMode('register'); setShowAuthModal(true); }}>
                Sign Up
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* HERO SECTION */}
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10 my-auto">
        <div className="lg:col-span-7 flex flex-col justify-center text-center lg:text-left">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-[#8e9bb0]"
          >
            Talk to the world.<br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#00f0ff] to-[#0072ff]">Zero friction.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base sm:text-lg text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed"
          >
            Connect instantly with verified peers worldwide. Experience completely secure, anonymous, high-quality audio, video, or text messaging with a single click.
          </motion.p>
          
          {/* CONTROL GLASS CELL */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="w-full max-w-xl mx-auto lg:mx-0"
          >
            <Card glow className="p-6 md:p-8 flex flex-col gap-4 border border-white/5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Choose Username (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. yash_7" 
                    value={guestUsername}
                    onChange={e => setGuestUsername(e.target.value)}
                    className="bg-black/30 border border-white/10 hover:border-white/15 focus:border-[#00f0ff] rounded-xl px-4 py-3.5 outline-none text-sm transition-all focus:ring-2 focus:ring-[#00f0ff]/20 placeholder-gray-600"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Interests (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="gaming, movies, music" 
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    className="bg-black/30 border border-white/10 hover:border-white/15 focus:border-[#00f0ff] rounded-xl px-4 py-3.5 outline-none text-sm transition-all focus:ring-2 focus:ring-[#00f0ff]/20 placeholder-gray-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                <Button 
                  onClick={() => handleGuestStart('random_text')}
                  variant="primary" 
                  size="md"
                  className="w-full text-base"
                >
                  <MessageCircle size={18} /> Text Chat
                </Button>
                <Button 
                  onClick={() => handleGuestStart('random_voice')}
                  variant="secondary" 
                  size="md"
                  className="w-full text-base"
                >
                  <Mic size={18} /> Voice Chat
                </Button>
                <Button 
                  onClick={() => handleGuestStart('random_video')}
                  variant="secondary" 
                  size="md"
                  className="w-full text-base"
                >
                  <Video size={18} /> Video Chat
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* STATS & SECURITY SIDEBAR */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-6 flex flex-col justify-center border border-white/5 hover:bg-white/10 transition-colors group cursor-default">
              <Users size={28} className="text-[#00f0ff] mb-3 group-hover:scale-110 transition-transform" />
              <div className="text-3xl font-extrabold tracking-tight mb-1 text-white">12.4k+</div>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider">online peers</div>
            </Card>
            <Card className="p-6 flex flex-col justify-center border border-white/5 hover:bg-white/10 transition-colors group cursor-default">
              <Clock size={28} className="text-[#00f0ff] mb-3 group-hover:scale-110 transition-transform" />
              <div className="text-3xl font-extrabold tracking-tight mb-1 text-white">9 mins</div>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider">avg session</div>
            </Card>
          </div>

          <Card className="p-8 border border-white/5 relative overflow-hidden group hover:bg-white/10 transition-colors cursor-default">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00f5a0] opacity-5 rounded-full blur-2xl pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
            <Shield size={32} className="text-[#00f5a0] mb-5 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold mb-3 tracking-tight text-white">E2E Anonymity</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              No tracking. No permanent storage of logs. Data flows directly peer-to-peer and expires immediately when your room destroys.
            </p>
          </Card>
        </div>
      </div>

      {/* FOOTER */}
      <div className="w-full text-center text-xs text-gray-600 mt-8">
        &copy; {new Date().getFullYear()} Peerly Inc. Built using WebRTC & Socket.IO. All rights reserved.
      </div>

      {/* AUTH MODAL */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md"
            >
              <Card glow className="relative border border-white/10 p-8">
                <button onClick={() => { setShowAuthModal(false); setOtpSent(false); }} className="absolute top-4 right-4 text-gray-500 hover:text-white cursor-pointer text-lg">✕</button>
                <h2 className="text-2xl font-bold mb-6 text-white">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
                
                {authMode === 'login' ? (
                  <>
                    {!useOtpLogin ? (
                      <form onSubmit={handleLogin} className="flex flex-col gap-4 mb-6">
                        <input required type="text" placeholder="Username or Email" value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm" />
                        <input required type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm" />
                        <Button type="submit" variant="primary" className="w-full py-3.5 mt-2">
                          Log In
                        </Button>
                        <button type="button" onClick={() => setUseOtpLogin(true)} className="text-gray-400 text-xs mt-2 hover:text-white transition-colors cursor-pointer">
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
                              className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm" 
                            />
                            <Button 
                              type="submit" 
                              disabled={isLoadingOtp || countdown > 0}
                              className="w-full py-3.5"
                            >
                              {isLoadingOtp ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Send Login Code'}
                            </Button>
                            <button type="button" onClick={() => setUseOtpLogin(false)} className="text-gray-400 text-xs mt-2 hover:text-white transition-colors cursor-pointer">
                              Use password instead
                            </button>
                          </form>
                        ) : (
                          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 mb-6">
                            <div className="text-xs text-gray-400 mb-2">Code sent to {emailInput}</div>
                            <input 
                              required 
                              type="text" 
                              placeholder="Enter 6-digit code" 
                              value={otpInput} 
                              onChange={e => setOtpInput(e.target.value)} 
                              className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-center tracking-widest font-mono text-lg" 
                              maxLength={6}
                            />
                            <Button 
                              type="submit" 
                              disabled={isLoadingOtp}
                              className="w-full py-3.5"
                            >
                              {isLoadingOtp ? 'Verifying...' : 'Verify Code'}
                            </Button>
                            <button 
                              type="button" 
                              onClick={() => setOtpSent(false)} 
                              className="text-gray-400 text-xs hover:text-white transition-colors cursor-pointer"
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
                        <input required type="text" placeholder="Username" value={regUsername} onChange={e => setRegUsername(e.target.value)} className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm" />
                        <div className="relative w-full">
                          <input required type="date" value={regDob} onChange={e => setRegDob(e.target.value)} className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm [&::-webkit-calendar-picker-indicator]:invert" />
                        </div>
                        <input required type="email" placeholder="Email Address" value={regEmail} onChange={e => setRegEmail(e.target.value)} className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm" />
                        <input required type="password" placeholder="Password (min 8 characters)" value={regPassword} onChange={e => setRegPassword(e.target.value)} className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-sm" />
                        
                        <Button 
                          type="submit" 
                          disabled={isLoadingOtp || countdown > 0} 
                          className="w-full py-3.5 mt-2"
                        >
                          {isLoadingOtp ? 'Sending Code...' : countdown > 0 ? `Resend in ${countdown}s` : 'Sign Up'}
                        </Button>
                      </form>
                    ) : (
                      <form onSubmit={handleRegister} className="flex flex-col gap-4 mb-6">
                        <div className="text-xs text-gray-400 mb-2">Code sent to {regEmail}</div>
                        <input 
                          required 
                          type="text" 
                          placeholder="Enter 6-digit code" 
                          value={otpInput} 
                          onChange={e => setOtpInput(e.target.value)} 
                          className="bg-black/20 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-[#00f0ff] w-full text-center tracking-widest font-mono text-lg" 
                          maxLength={6}
                        />
                        <Button 
                          type="submit" 
                          disabled={isLoadingOtp}
                          className="w-full py-3.5"
                        >
                          {isLoadingOtp ? 'Verifying...' : 'Verify & Create Account'}
                        </Button>
                        <button 
                          type="button" 
                          onClick={() => setOtpSent(false)} 
                          className="text-gray-400 text-xs hover:text-white transition-colors cursor-pointer"
                        >
                          Edit details
                        </button>
                      </form>
                    )}
                  </>
                )}

                <div className="flex items-center gap-4 my-6">
                  <div className="h-px bg-white/10 flex-1"></div>
                  <div className="text-gray-400 text-xs">or connect with</div>
                  <div className="h-px bg-white/10 flex-1"></div>
                </div>

                <div className="flex justify-center w-full mt-4">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => {
                      toast.error('Google Login Failed');
                    }}
                    theme="filled_black"
                    shape="rectangular"
                    text={authMode === 'login' ? 'continue_with' : 'signup_with'}
                  />
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
