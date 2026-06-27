import { API_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { Shield, UserPlus, X, Send } from 'lucide-react';
import { useAuthStore } from '../store';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export const Chat = ({ guest, onLeave, tags = [] }: { guest: any; onLeave: () => void; tags?: string[] }) => {
  const { token } = useAuthStore();
  const [status, setStatus] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<{senderId: string, content: string, time: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    socket.connect();
    
    // Join matchmaking queue
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      setStatus('waiting');
      socket.emit('match:join', { guestId: guest.id, tags }, (res: any) => {
        if (res.status === 'matched') {
          setStatus('matched');
          setRoomId(res.roomId);
        }
      });
    }

    socket.on('session:start', (data) => {
      setStatus('matched');
      setRoomId(data.roomId);
      setSessionId(data.sessionId);
      setPartnerId(data.partnerId);
      setPartnerUsername(data.partnerUsername || null);
      setMessages([]);
      socket.emit('session:joined', data);
    });

    socket.on('message:receive', (msg) => {
      setMessages(prev => [...prev, {
        senderId: msg.sender_id,
        content: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      }]);
      setPartnerTyping(false);
    });

    socket.on('typing:start', () => {
      setPartnerTyping(true);
    });

    socket.on('typing:stop', () => {
      setPartnerTyping(false);
    });

    socket.on('session:ended', () => {
      setStatus('ended');
      setPartnerTyping(false);
    });

    return () => {
      socket.off('session:start');
      socket.off('message:receive');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('session:ended');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== 'matched') return;
    
    socket.emit('message:send', {
      roomId,
      message: input,
      senderId: guest.id,
      sessionId
    });
    
    setInput('');
    setIsTyping(false);
    socket.emit('typing:stop', { roomId, senderId: guest.id });
    if(typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    
    if (status !== 'matched') return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing:start', { roomId, senderId: guest.id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing:stop', { roomId, senderId: guest.id });
    }, 1500);
  };

  const handleEnd = () => {
    if (roomId && sessionId) {
      socket.emit('session:end', { roomId, sessionId });
    }
    onLeave();
  };

  const handleAddFriend = async () => {
    if (!token || !partnerId || guest.type !== 'user') return;
    const loadingToast = toast.loading('Sending request...');
    try {
      const res = await fetch(`${API_URL}/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: partnerId })
      });
      const data = await res.json();
      toast.dismiss(loadingToast);
      if (data.success) {
        toast.success("Friend request sent!");
      } else {
        toast.error(data.error || "Could not send friend request");
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error("Error sending request");
    }
  };

  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[var(--color-accent)] opacity-5 blur-[100px] rounded-full pointer-events-none w-96 h-96 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative flex items-center justify-center mb-8">
            <div className="absolute w-24 h-24 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin opacity-50" />
            <div className="absolute w-16 h-16 border-4 border-[var(--color-accent)] border-b-transparent rounded-full animate-spin animation-delay-150 opacity-70" />
            <div className="w-8 h-8 bg-[var(--color-accent)] rounded-full animate-pulse shadow-[0_0_20px_var(--color-accent)]" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Looking for a match...</h2>
          <p className="text-[var(--color-text-secondary)] mb-8">Get ready to meet someone new.</p>
          <button onClick={onLeave} className="px-8 py-3 rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:scale-105 transition-all text-sm font-semibold">
            Cancel Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col max-w-4xl mx-auto border-x border-[var(--color-border)] shadow-2xl">
      {/* HEADER */}
      <div className="h-16 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button onClick={handleEnd} className="text-[var(--color-text-secondary)] hover:text-white flex items-center gap-2">
            <X size={20} /> Back
          </button>
          <div className="font-mono text-[var(--color-text-primary)] font-bold">
            {partnerUsername ? `@${partnerUsername}` : 'Stranger'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-[var(--color-danger)] p-2 hover:bg-[var(--color-surface-raised)] rounded-lg transition-colors" title="Report">
            <Shield size={20} />
          </button>
          {guest.type === 'user' && (
            <button onClick={handleAddFriend} className="text-[var(--color-accent)] p-2 hover:bg-[var(--color-surface-raised)] rounded-lg transition-colors" title="Add Friend">
              <UserPlus size={20} />
            </button>
          )}
          <button onClick={handleEnd} className="bg-[var(--color-danger)] text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-opacity-80 transition-colors">
            End
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        <div className="text-center text-[var(--color-text-secondary)] text-sm my-4 border-b border-[var(--color-border)] pb-4">
          You are now chatting with {partnerUsername ? `@${partnerUsername}` : 'a random stranger'}.<br/>Say hi!
        </div>
        
        {messages.map((m, i) => {
          const isMe = m.senderId === guest.id;
          return (
            <div key={i} className={clsx("flex flex-col max-w-[70%]", isMe ? "self-end items-end" : "self-start items-start")}>
              <div className={clsx(
                "px-4 py-2",
                isMe ? "bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]" : "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)]",
                isMe ? "rounded-[16px_16px_4px_16px]" : "rounded-[16px_16px_16px_4px]"
              )}>
                {m.content}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-1 px-1">
                {m.time} {isMe && <span className="text-[var(--color-accent)] ml-1">✓✓</span>}
              </div>
            </div>
          );
        })}
        {partnerTyping && (
          <div className="self-start items-start flex flex-col max-w-[70%]">
             <div className="text-sm text-[var(--color-text-secondary)] mt-1 px-1 flex items-center gap-1">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce" />
                </div>
                {partnerUsername ? `@${partnerUsername}` : 'Stranger'} is typing...
             </div>
          </div>
        )}
        {status === 'ended' && (
          <div className="text-center my-4 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-lg p-4 mx-auto max-w-sm">
            <div className="text-[var(--color-text-primary)] font-semibold mb-1">Stranger has disconnected</div>
            <div className="text-[var(--color-text-secondary)] text-sm mb-4">The chat session has ended.</div>
            <button 
              onClick={() => {
                setStatus('waiting');
                setMessages([]);
                socket.emit('match:join', { guestId: guest.id, tags }, (res: any) => {
                  if (res.status === 'matched') {
                    setStatus('matched');
                    setRoomId(res.roomId);
                  }
                });
              }}
              className="bg-[var(--color-accent)] text-[var(--color-bg)] font-medium px-4 py-2 rounded-lg hover:bg-[#33dfff] transition-colors text-sm w-full"
            >
              Find New Match
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="p-4 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
        <form onSubmit={handleSend} className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={handleTyping}
            placeholder={status === 'ended' ? "Chat ended..." : "Type a message..."}
            disabled={status === 'ended'}
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-muted)] rounded-lg px-4 py-3 outline-none transition-all disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={!input.trim() || status === 'ended'}
            className="bg-[var(--color-accent)] text-[var(--color-bg)] p-3 rounded-lg disabled:opacity-50 hover:bg-[#33dfff] transition-colors flex items-center justify-center"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};
