import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store';
import { LogOut, User as UserIcon, MessageCircle, Settings, Users, Video, Mic, Camera, Trash2, ShieldAlert } from 'lucide-react';
import { socket } from '../socket';
import toast from 'react-hot-toast';

export const Dashboard = ({ onStartChat, onStartFriendChat }: { onStartChat: (type?: 'random_text' | 'random_video' | 'random_voice', tags?: string[]) => void; onStartFriendChat: (friend: any) => void }) => {
  const { token, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [activeFriends, setActiveFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    fetchProfile();
    
    socket.on('presence:update', () => {
      // Refresh friends list or update local state
      fetchProfile();
    });

    return () => {
      socket.off('presence:update');
    };
  }, []);

  const fetchProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.user) {
        setProfile(data.user);
        setDisplayName(data.user.display_name || '');
        setBio(data.user.bio || '');
        if (data.user.avatar_url && data.user.avatar_url.startsWith('http')) {
          setAvatarPreview(data.user.avatar_url);
        } else if (data.user.avatar_url) {
          setAvatarPreview(`${API_URL}${data.user.avatar_url}`);
        }
        setActiveFriends(data.friendships || []);
        setPendingRequests(data.pendingRequests || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    const formData = new FormData();
    formData.append('display_name', displayName);
    formData.append('bio', bio);
    if (avatarFile) formData.append('avatar', avatarFile);

    try {
      const loadingToast = toast.loading('Saving profile...');
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      toast.dismiss(loadingToast);
      if (data.success) {
        setProfile(data.user);
        setIsEditing(false);
        toast.success("Profile updated!");
      } else {
        toast.error("Failed to update profile");
      }
    } catch (e) {
      toast.dismiss();
      toast.error("Error updating profile");
    }
  };

  const respondToRequest = async (requestId: string, action: 'accepted' | 'declined') => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/friends/respond`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId, action })
      });
      const data = await res.json();
      if(data.success) {
        toast.success(`Request ${action}ed!`);
        fetchProfile();
      } else {
        toast.error("Failed to respond");
      }
    } catch (e) {
      toast.error('Could not cancel request');
    }
  };

  const handleDeleteProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Account deleted successfully');
        logout();
      } else {
        toast.error('Failed to delete account');
      }
    } catch (e) {
      toast.error('Cannot connect to server');
    }
  };

  if (!profile) return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[var(--color-accent)] opacity-5 blur-[100px] rounded-full pointer-events-none w-96 h-96 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-16 h-16 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin opacity-50" />
          <div className="w-6 h-6 bg-[var(--color-accent)] rounded-full animate-pulse shadow-[0_0_20px_var(--color-accent)]" />
        </div>
        <div className="text-[var(--color-text-secondary)] font-medium">Loading Dashboard...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        
        {/* HEADER */}
        <div className="flex justify-between items-center bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)]">
          <div className="text-2xl font-bold font-mono tracking-tighter">
            Peerly<span className="text-[var(--color-accent)]">.</span>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] transition-colors">
            <LogOut size={20} /> Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* PROFILE CELL */}
          <div className="col-span-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 relative">
            <button onClick={() => setIsEditing(!isEditing)} className="absolute top-6 right-6 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
              <Settings size={20} />
            </button>
            
            <div className="flex flex-col items-center mt-4">
              {!isEditing ? (
                <>
                  <div className="w-32 h-32 rounded-full bg-[var(--color-surface-raised)] border-2 border-[var(--color-border)] flex items-center justify-center overflow-hidden mb-4">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url.startsWith('http') ? profile.avatar_url : `${API_URL}${profile.avatar_url}`} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={48} className="text-[var(--color-text-secondary)]" />
                    )}
                  </div>
                  <h2 className="text-2xl font-bold">{profile.display_name || profile.username}</h2>
                  <p className="text-[var(--color-text-secondary)] font-mono mb-4">@{profile.username}</p>
                  <p className="text-center text-sm">{profile.bio || "No bio yet."}</p>
                </>
              ) : (
                <form onSubmit={handleUpdateProfile} className="w-full flex flex-col items-center gap-4">
                  <div className="relative w-32 h-32 rounded-full cursor-pointer group border-4 border-[var(--color-surface-raised)] overflow-hidden hover:border-[var(--color-accent)] transition-all mb-2" onClick={() => document.getElementById('avatar-upload')?.click()}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    ) : profile.avatar_url ? (
                      <img src={profile.avatar_url.startsWith('http') ? profile.avatar_url : `${API_URL}${profile.avatar_url}`} alt="Avatar" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-raised)]">
                        <UserIcon size={48} className="text-[var(--color-text-secondary)]" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <Camera size={24} className="text-white" />
                      <span className="text-xs font-semibold text-white">Change</span>
                    </div>
                  </div>
                  <input id="avatar-upload" type="file" className="hidden" accept="image/*" onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      setAvatarFile(file);
                      setAvatarPreview(URL.createObjectURL(file));
                    }
                  }} />
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display Name" className="bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 rounded-lg outline-none focus:border-[var(--color-accent)] w-full" />
                  <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Bio" className="bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 rounded-lg outline-none focus:border-[var(--color-accent)] text-sm h-24 w-full" />
                  <div className="flex gap-2 w-full mt-2">
                    <button type="button" onClick={() => setIsEditing(false)} className="flex-1 border border-[var(--color-border)] py-2 rounded-lg text-sm transition-colors hover:bg-[var(--color-border)]">Cancel</button>
                    <button type="submit" className="flex-1 bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-2 rounded-lg text-sm transition-transform hover:scale-105">Save Changes</button>
                  </div>
                  
                  <div className="w-full h-px bg-[var(--color-border)] my-4"></div>
                  
                  {!showDeleteConfirm ? (
                    <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full flex justify-center items-center gap-2 text-sm text-[var(--color-danger)] py-2 hover:bg-[var(--color-danger)]/10 rounded-lg transition-colors">
                      <Trash2 size={16} /> Delete Account
                    </button>
                  ) : (
                    <div className="w-full bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 p-4 rounded-lg flex flex-col items-center">
                      <ShieldAlert size={24} className="text-[var(--color-danger)] mb-2" />
                      <p className="text-sm text-center mb-3 text-[var(--color-danger)]">Are you absolutely sure? This cannot be undone.</p>
                      <div className="flex gap-2 w-full">
                        <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 border border-[var(--color-danger)]/30 text-[var(--color-danger)] py-1.5 rounded text-sm hover:bg-[var(--color-danger)]/10">Cancel</button>
                        <button type="button" onClick={handleDeleteProfile} className="flex-1 bg-[var(--color-danger)] text-white font-bold py-1.5 rounded text-sm hover:bg-red-600 transition-colors">Confirm Delete</button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="col-span-1 md:col-span-2 flex flex-col gap-6">
            
            {/* START CHAT HERO */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-accent-muted)] rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-accent)] opacity-5 blur-[100px] rounded-full pointer-events-none" />
              <div>
                <h3 className="text-2xl font-bold mb-2">Ready to meet someone new?</h3>
                <p className="text-[var(--color-text-secondary)]">Jump right into a random text or video chat anonymously.</p>
              </div>
              <div className="flex flex-col gap-3 z-10 w-full md:w-auto items-stretch">
                <input 
                  type="text" 
                  placeholder="Interests (optional, comma-separated)" 
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-lg px-4 py-3 outline-none text-sm w-full md:min-w-[280px]"
                />
                <div className="flex gap-2">
                  <button onClick={() => {
                    const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                    onStartChat('random_text', tags);
                  }} className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[#33dfff] transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,255,255,0.2)] whitespace-nowrap flex-1">
                    <MessageCircle size={20} />
                    Text Chat
                  </button>
                  <button onClick={() => {
                    const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                    onStartChat('random_voice', tags);
                  }} className="bg-[var(--color-surface-raised)] border border-[var(--color-accent)] text-[var(--color-text-primary)] font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] transition-all hover:scale-105 whitespace-nowrap flex-1">
                    <Mic size={20} />
                    Voice Chat
                  </button>
                  <button onClick={() => {
                    const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                    onStartChat('random_video', tags);
                  }} className="bg-[var(--color-surface-raised)] border border-[var(--color-accent)] text-[var(--color-text-primary)] font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] transition-all hover:scale-105 whitespace-nowrap flex-1">
                    <Video size={20} />
                    Video Chat
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
              {/* FRIENDS LIST */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Users className="text-[var(--color-accent)]" />
                  <h3 className="text-xl font-bold">Friends</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
                  {activeFriends.length === 0 ? (
                    <div className="text-[var(--color-text-secondary)] text-sm text-center my-auto">No friends yet. Find matches to add friends!</div>
                  ) : (
                    activeFriends.map(f => {
                      const friendData = f.user_id === profile.id ? f.friend : (f.friend || f.user_a || f.user_b);
                      return (
                        <div key={f.id} onClick={() => onStartFriendChat(friendData)} className="flex items-center gap-4 bg-[var(--color-surface-raised)] p-3 rounded-xl border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-border)] transition-colors">
                          <div className="w-10 h-10 rounded-full bg-[var(--color-bg)] overflow-hidden shrink-0">
                            {friendData.avatar_url ? <img src={`${API_URL}${friendData.avatar_url}`} alt="Avatar" className="w-full h-full object-cover" /> : <UserIcon className="w-full h-full p-2 text-[var(--color-text-secondary)]" />}
                          </div>
                          <div>
                            <div className="font-bold text-sm">{friendData.display_name || friendData.username}</div>
                            <div className="text-xs text-[var(--color-text-secondary)]">@{friendData.username}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* PENDING REQUESTS */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <div className="relative">
                    <Users className="text-[var(--color-text-primary)]" />
                    {pendingRequests.length > 0 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--color-accent)] rounded-full border-2 border-[var(--color-surface)]" />}
                  </div>
                  <h3 className="text-xl font-bold">Friend Requests</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {pendingRequests.length === 0 ? (
                    <div className="text-[var(--color-text-secondary)] text-sm text-center my-auto h-full flex items-center justify-center">No pending requests</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {pendingRequests.map(f => (
                        <div key={f.id} className="bg-[var(--color-surface-raised)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                          <div className="flex items-center p-4 gap-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--color-bg)] overflow-hidden shrink-0 border border-[var(--color-border)]">
                              {f.sender.avatar_url ? (
                                <img src={`${API_URL}${f.sender.avatar_url}`} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <UserIcon className="w-full h-full p-3 text-[var(--color-text-secondary)]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-[var(--color-text-primary)] text-lg truncate">
                                {f.sender.display_name || f.sender.username}
                              </div>
                              <div className="text-sm text-[var(--color-text-secondary)] truncate">
                                @{f.sender.username}
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-4 flex gap-2 mt-auto">
                            <button 
                              onClick={() => respondToRequest(f.id, 'accepted')} 
                              className="flex-1 bg-[var(--color-accent)] text-[var(--color-bg)] py-2 rounded-lg text-sm font-bold hover:bg-[#33dfff] transition-colors"
                            >
                              Confirm
                            </button>
                            <button 
                              onClick={() => respondToRequest(f.id, 'declined')} 
                              className="flex-1 bg-[#3A3B40] text-[var(--color-text-primary)] py-2 rounded-lg text-sm font-bold hover:bg-[#4A4B50] transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};
