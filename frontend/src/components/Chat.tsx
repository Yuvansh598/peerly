import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { Shield, X, Send, SkipForward, Copy, Smile, Check } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { SearchingScreen } from './SearchingScreen';
import { CallDuration, formatDuration } from './CallDuration';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { motion, AnimatePresence } from 'framer-motion';

const EMOJIS = ['😀', '😂', '😍', '🙏', '👍', '🔥', '✨', '💯'];

export const Chat = ({ guest, onLeave, tags = [] }: { guest: any; onLeave: () => void; tags?: string[] }) => {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setPartnerId] = useState<string | null>(null);
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<{id: string, senderId: string, content: string, time: string, delivered: boolean}[]>([]);
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
      socket.emit('match:join', { type: 'random_text', tags }, (res: any) => {
        if (res.success && res.status === 'matched') {
          setStatus('matched');
          setRoomId(res.roomId);
        }
      });
    }

    const handleSessionStart = (data: any) => {
      setStatus('matched');
      setRoomId(data.roomId);
      setSessionId(data.sessionId);
      setPartnerId(data.partnerId);
      setPartnerUsername(data.partnerUsername || null);
      setMessages([]);
      setStartTime(Date.now());
      socket.emit('session:joined', data);
    };

    const handleMessageReceive = (msg: any) => {
      setMessages(prev => [...prev, {
        id: msg.id || Math.random().toString(),
        senderId: msg.sender_id,
        content: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        delivered: true
      }]);
      setPartnerTyping(false);
    };

    const handleTypingStart = () => setPartnerTyping(true);
    const handleTypingStop = () => setPartnerTyping(false);

    const handleSessionEnded = () => {
      setStatus('ended');
      setPartnerTyping(false);
    };

    socket.on('session:start', handleSessionStart);
    socket.on('message:receive', handleMessageReceive);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('session:ended', handleSessionEnded);

    return () => {
      socket.off('session:start', handleSessionStart);
      socket.off('message:receive', handleMessageReceive);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('session:ended', handleSessionEnded);
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
    const val = e.target.value;
    if (val.length > 1000) return; // Enforce local limits
    setInput(val);
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
    socket.emit('match:skip', null, (res: any) => {
      if (res.success) {
        setStatus('waiting');
        setMessages([]);
        setStartTime(null);
        socket.emit('match:join', { type: 'random_text', tags }, (joinRes: any) => {
          if (joinRes.success && joinRes.status === 'matched') {
            setStatus('matched');
            setRoomId(joinRes.roomId);
          }
        });
      }
    });
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
      urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#00f0ff] hover:underline break-all">{part}</a> : <span key={i} className="break-words">{part}</span>
    );
  };

  if (status === 'waiting') {
    return <SearchingScreen onCancel={handleLeave} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#070913] text-[#f0f4ff] relative overflow-hidden">
      {/* Top Bar */}
      <div className="h-16 flex items-center justify-between px-4 lg:px-6 bg-white/5 backdrop-blur-xl border-b border-white/5 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={handleLeave} className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-gray-400 hover:text-white">
            <X size={20} />
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-base leading-tight">
              {partnerUsername ? `@${partnerUsername}` : 'Stranger'}
            </span>
            {startTime && <div className="text-xs mt-0.5"><ConnectionStatus status={status} /></div>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {startTime && <div className="text-gray-400 font-mono text-sm mr-2 hidden sm:block"><CallDuration startTime={startTime} /></div>}
          <Button onClick={handleSkip} variant="secondary" size="sm" className="h-9 px-4">
            <SkipForward size={14} /> Skip
          </Button>
          <button className="p-2 text-red-400 hover:bg-red-400/10 rounded-full transition-colors cursor-pointer" title="Report">
            <Shield size={18} />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-4 relative no-scrollbar">
        <div className="text-center text-gray-500 text-xs my-4 select-none">
          <div className="inline-block bg-white/5 border border-white/5 rounded-full px-4 py-1.5 backdrop-blur-sm">
            Chat match established. Say hello!
          </div>
        </div>
        
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const isMe = m.senderId === guest.id;
            return (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx("flex flex-col max-w-[85%] sm:max-w-[70%] group", isMe ? "self-end items-end" : "self-start items-start")}
              >
                <div className="flex items-center gap-2">
                  {isMe && (
                    <button 
                      onClick={() => copyText(m.content)} 
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all cursor-pointer"
                      title="Copy"
                    >
                      <Copy size={12}/>
                    </button>
                  )}
                  <div className={clsx(
                    "px-4.5 py-3 text-sm leading-relaxed shadow-lg select-text",
                    isMe 
                      ? "bg-gradient-to-tr from-[#0072ff] to-[#00f0ff] text-black font-semibold rounded-[20px_20px_4px_20px]" 
                      : "bg-white/5 text-[#f0f4ff] border border-white/5 rounded-[20px_20px_20px_4px]"
                  )}>
                    {renderMessageContent(m.content)}
                  </div>
                  {!isMe && (
                    <button 
                      onClick={() => copyText(m.content)} 
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all cursor-pointer"
                      title="Copy"
                    >
                      <Copy size={12}/>
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 px-2 font-mono flex items-center gap-1 select-none">
                  {m.time} {isMe && <Check size={10} className="text-[#00f0ff]" />}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {partnerTyping && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="self-start flex flex-col animate-pulse"
          >
             <div className="bg-white/5 border border-white/5 rounded-full px-4 py-2 flex items-center gap-1.5 w-fit">
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
             </div>
          </motion.div>
        )}
        
        <AnimatePresence>
          {status === 'ended' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm"
              >
                <Card glow className="p-8 text-center flex flex-col items-center border border-white/10">
                  <div className="w-16 h-16 bg-red-500/10 border border-[#ff4d6d]/20 rounded-full flex items-center justify-center mb-4">
                    <X size={32} className="text-[#ff4d6d]" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Partner Disconnected</h3>
                  <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                    Conversation duration: {startTime ? formatDuration(Date.now() - startTime) : '00:00'}
                  </p>
                  <div className="flex flex-col gap-3 w-full">
                    <Button onClick={handleSkip} variant="primary" className="w-full">
                      Find New Match
                    </Button>
                    <Button onClick={handleLeave} variant="secondary" className="w-full">
                      Back to Dashboard
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-white/5 backdrop-blur-xl border-t border-white/5 shrink-0 relative">
        <AnimatePresence>
          {showEmojis && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-4 mb-2 bg-[#0a0e1e] border border-white/10 rounded-2xl p-2 flex gap-2 shadow-2xl z-30"
            >
              {EMOJIS.map(e => (
                <button 
                  key={e} 
                  onClick={() => { setInput(i => i + e); setShowEmojis(false); }} 
                  className="hover:bg-white/10 p-2 rounded-xl text-xl transition-colors cursor-pointer"
                >
                  {e}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex items-end gap-3 max-w-5xl mx-auto">
          <div className="flex-1 bg-black/20 border border-white/10 rounded-2xl flex items-end p-1.5 focus-within:border-[#00f0ff]/50 focus-within:ring-2 focus-within:ring-[#00f0ff]/10 transition-all">
            <button 
              onClick={() => setShowEmojis(!showEmojis)} 
              className="p-3 text-gray-500 hover:text-white rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              <Smile size={20} />
            </button>
            <textarea 
              value={input}
              onChange={handleTyping}
              onKeyDown={handleKeyDown}
              placeholder="Type message..."
              disabled={status === 'ended'}
              className="flex-1 bg-transparent border-none outline-none text-sm resize-none max-h-32 min-h-[44px] py-3 px-2 leading-relaxed custom-scrollbar disabled:opacity-50 disabled:cursor-not-allowed text-[#f0f4ff]"
              rows={1}
            />
            {input.trim() && (
              <span className="text-[10px] text-gray-600 px-3 py-2 font-mono">
                {input.length}/1000
              </span>
            )}
          </div>
          <Button 
            onClick={() => handleSend()}
            disabled={!input.trim() || status === 'ended'}
            variant="primary"
            className="h-[56px] w-[56px] rounded-2xl shrink-0 p-0 flex items-center justify-center"
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
};
