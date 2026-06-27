import { API_URL } from '../config';
import React, { useState, useRef } from 'react';
import { Camera, X, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface CompleteProfileModalProps {
  googleData: {
    email: string;
    google_id: string;
    name: string;
    picture: string;
  };
  onComplete: (token: string, user: any) => void;
  onCancel: () => void;
}

export const CompleteProfileModal: React.FC<CompleteProfileModalProps> = ({ googleData, onComplete, onCancel }) => {
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>(googleData.picture || '');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !dob) {
      toast.error('Username and Date of Birth are required');
      return;
    }

    setLoading(true);
    const loadingToast = toast.loading('Creating your account...');

    try {
      const formData = new FormData();
      formData.append('email', googleData.email);
      formData.append('google_id', googleData.google_id);
      formData.append('name', googleData.name);
      formData.append('username', username);
      formData.append('date_of_birth', dob);
      if (avatarFile) {
        formData.append('avatar', avatarFile);
      } else {
        formData.append('picture', googleData.picture);
      }

      const res = await fetch(`${API_URL}/auth/google/register', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      toast.dismiss(loadingToast);

      if (data.success) {
        toast.success('Welcome to Peerly!');
        onComplete(data.token, data.user);
      } else {
        toast.error(data.error || 'Failed to complete profile');
      }
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 text-[var(--color-text-secondary)] hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h2 className="text-2xl font-bold mb-2">Almost there!</h2>
        <p className="text-[var(--color-text-secondary)] mb-6 text-sm">
          Complete your profile to start chatting.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Cool Interactive Avatar Upload */}
          <div className="flex flex-col items-center mb-2">
            <div 
              className="relative w-28 h-28 rounded-full cursor-pointer group border-4 border-[var(--color-surface-raised)] overflow-hidden hover:border-[var(--color-accent)] transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <img 
                  src={preview} 
                  alt="Avatar Preview" 
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=User&background=random'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)]">
                  <UserIcon size={40} className="text-[var(--color-text-secondary)]" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                <Camera size={24} className="text-white" />
                <span className="text-xs font-semibold text-white">Upload</span>
              </div>
            </div>
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a cool username..."
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-lg px-4 py-3 outline-none text-[var(--color-text-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Date of Birth</label>
            <input 
              type="date" 
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-lg px-4 py-3 outline-none text-[var(--color-text-primary)]"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-4 w-full bg-[var(--color-accent)] text-[var(--color-bg)] font-bold py-3 rounded-xl hover:bg-[#33dfff] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? 'Creating Account...' : 'Complete Profile & Join'}
          </button>
        </form>
      </div>
    </div>
  );
};
