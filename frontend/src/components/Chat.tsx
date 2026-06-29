import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { Shield, X, Send, SkipForward, Copy, Smile } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { SearchingScreen } from './SearchingScreen';
import { CallDuration, formatDuration } from './CallDuration';

const EMOJIS = ['😀', '😂', '😍', '🙏', '👍', '🔥', '✨', '💯'];

export const Chat = ({ guest, onLeave, tags = [] }: { guest: any; onLeave: () => void; tags?: string[] }) => {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setPartnerId] = useState<string | null>(null);
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<{id: string, senderId: string, content: string, time: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    socket.connect();
    
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
      setStartTime(Date.now());
      socket.emit('session:joined', data);
    });

    socket.on('message:receive', (msg) => {
      setMessages(prev => [...prev, {
        id: msg.id || Math.random().toString(),
        senderId: msg.sender_id,
        content: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      }]);
      setPartnerTyping(false);
    });

    socket.on('typing:start', () => setPartnerTyping(true));
    socket.on('typing:stop', () => setPartnerTyping(false));

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
  }, [guest.id, tags]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerTyping]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status !== 'matched') return;
    
    socket.emit('message:send', { roomId, message: input, senderId: guest.id, sessionId });
    setInput('');
    setShowEmojis(false);
    setIsTyping(false);
    socket.emit('typing:stop', { roomId, senderId: guest.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (status !== 'matched') return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing:start', { roomId, senderId: guest.id });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing:stop', { roomId, senderId: guest.id });
    }, 1500);
  };

  const handleSkip = () => {
    socket.emit('match:skip', { type: 'random_text', tags });
    setStatus('waiting');
    setMessages([]);
    setStartTime(null);
  };

  const handleLeave = () => {
    if (roomId && sessionId) socket.emit('match:leave');
    onLeave();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Message copied");
  };

  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.split(urlRegex).map((part, i) => 
      urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline break-all">{part}</a> : <span key={i} className="break-words">{part}</span>
    );
  };

  if (status === 'waiting') {
    return <SearchingScreen onCancel={handleLeave} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#0F1015] text-[var(--color-text-primary)] relative animate-in fade-in zoom-in-95 duration-300">
      {/* Top Bar */}
      <div className="h-16 flex items-center justify-between px-4 lg:px-6 bg-white/5 backdrop-blur-xl border-b border-white/10 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={handleLeave} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight">
              {partnerUsername ? `@${partnerUsername}` : 'Stranger'}
            </span>
            {startTime && <div className="text-cyan-400"><CallDuration startTime={startTime} /></div>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleSkip} className="hidden md:flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 border border-white/5">
            <SkipForward size={16}/> Skip
          </button>
          <button className="p-2 text-red-400 hover:bg-red-400/10 rounded-full transition-colors" title="Report">
            <Shield size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-6 relative">
        <div className="text-center text-[var(--color-text-secondary)] text-sm my-6">
          <div className="inline-block bg-white/5 border border-white/10 rounded-full px-4 py-1.5 backdrop-blur-sm">
            Chat started. Say hi!
          </div>
        </div>
        
        {messages.map((m, i) => {
          const isMe = m.senderId === guest.id;
          return (
            <div key={m.id || i} className={clsx("flex flex-col max-w-[85%] md:max-w-[70%] group animate-in slide-in-from-bottom-2 fade-in duration-300", isMe ? "self-end items-end" : "self-start items-start")}>
              <div className="flex items-center gap-2">
                {isMe && <button onClick={() => copyText(m.content)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-[var(--color-text-secondary)] transition-all"><Copy size={14}/></button>}
                <div className={clsx(
                  "px-5 py-3 text-[15px] leading-relaxed shadow-md",
                  isMe ? "bg-cyan-600/90 text-white rounded-[20px_20px_4px_20px]" : "bg-white/10 text-white border border-white/5 rounded-[20px_20px_20px_4px]"
                )}>
                  {renderMessageContent(m.content)}
                </div>
                {!isMe && <button onClick={() => copyText(m.content)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-[var(--color-text-secondary)] transition-all"><Copy size={14}/></button>}
              </div>
              <div className="text-[11px] text-[var(--color-text-secondary)] mt-1.5 px-2 font-medium tracking-wide">
                {m.time} {isMe && <span className="text-cyan-400 ml-1">✓</span>}
              </div>
            </div>
          );
        })}

        {partnerTyping && (
          <div className="self-start flex flex-col max-w-[70%] animate-in fade-in duration-300">
             <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 flex items-center gap-1.5 w-fit">
                <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce" />
             </div>
          </div>
        )}
        
        {status === 'ended' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
            <div className="bg-[#1a1b1e] border border-white/10 shadow-2xl rounded-2xl p-8 max-w-sm w-full text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <X size={32} className="text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Partner disconnected.</h3>
              <p className="text-[var(--color-text-secondary)] mb-6 font-medium">
                Conversation lasted: {startTime ? formatDuration(Date.now() - startTime) : '00:00'}
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button onClick={handleSkip} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3.5 rounded-xl transition-all active:scale-95 w-full">
                  Find New Match
                </button>
                <button onClick={handleLeave} className="bg-white/5 hover:bg-white/10 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95 w-full">
                  Home
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white/5 backdrop-blur-xl border-t border-white/10 shrink-0 relative">
        {showEmojis && (
          <div className="absolute bottom-full left-4 mb-2 bg-[#1a1b1e] border border-white/10 rounded-xl p-2 flex gap-2 shadow-2xl animate-in slide-in-from-bottom-2 fade-in">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => { setInput(i => i + e); setShowEmojis(false); }} className="hover:bg-white/10 p-2 rounded-lg text-xl transition-colors">
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3 max-w-5xl mx-auto">
          <div className="flex-1 bg-[#1a1b1e] border border-white/10 rounded-[24px] flex items-end p-1.5 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all shadow-inner">
            <button onClick={() => setShowEmojis(!showEmojis)} className="p-3 text-[var(--color-text-secondary)] hover:text-white rounded-full transition-colors shrink-0">
              <Smile size={22} />
            </button>
            <textarea 
              value={input}
              onChange={handleTyping}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              disabled={status === 'ended'}
              className="flex-1 bg-transparent border-none outline-none text-[15px] resize-none max-h-32 min-h-[44px] py-3 px-2 leading-relaxed custom-scrollbar disabled:opacity-50"
              rows={1}
            />
          </div>
          <button 
            onClick={() => handleSend()}
            disabled={!input.trim() || status === 'ended'}
            className="bg-cyan-500 text-black p-4 rounded-full disabled:opacity-50 hover:bg-cyan-400 hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,255,255,0.2)] shrink-0 flex items-center justify-center h-[56px] w-[56px]"
          >
            <Send size={20} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
