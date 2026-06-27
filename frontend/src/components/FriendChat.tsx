import { API_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { Send, ArrowLeft, User as UserIcon, Video, Mic } from 'lucide-react';
import { useAuthStore } from '../store';
import toast from 'react-hot-toast';

export const FriendChat = ({ friend, onLeave }: { friend: any; onLeave: () => void }) => {
  const { token, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{senderId: string, content: string, time: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    socket.connect();
    
    // Fetch chat history
    fetch(`http://localhost:3001/friends/${friend.id}/chat`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.chatSession) {
          const sId = data.chatSession.id;
          const rId = `room:friend:${sId}`;
          setSessionId(sId);
          setRoomId(rId);
          
          // Map DB messages to UI format
          const history = data.chatSession.messages.map((m: any) => ({
            senderId: m.sender_id,
            content: m.content || '',
            time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setMessages(history);
          setLoading(false);
          
          // Join the socket room
          socket.emit('session:joined', { roomId: rId, sessionId: sId });
        } else {
          toast.error("Failed to load chat history");
          onLeave();
        }
      })
      .catch(err => {
        console.error(err);
        onLeave();
      });

    socket.on('message:receive', (msg) => {
      setMessages(prev => [...prev, {
        senderId: msg.sender_id,
        content: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    });

    socket.on('typing:start', (data) => {
      if (data.senderId !== user?.id) setPartnerTyping(true);
    });

    socket.on('typing:stop', (data) => {
      if (data.senderId !== user?.id) setPartnerTyping(false);
    });

    return () => {
      socket.off('message:receive');
      socket.off('typing:start');
      socket.off('typing:stop');
      // No match:leave because it's a persistent room, just let disconnect handle it
      // or emit a specific leave event if needed. We can just stop listening.
    };
  }, [friend.id, token, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !roomId || !sessionId) return;

    socket.emit('message:send', { roomId, sessionId, message: input });
    setInput('');
    setIsTyping(false);
    socket.emit('typing:stop', { roomId });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    
    if (!isTyping && roomId) {
      setIsTyping(true);
      socket.emit('typing:start', { roomId });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (roomId) socket.emit('typing:stop', { roomId });
    }, 1000);
  };

  if (loading) {
    return (
      <div className="h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0F1015] text-[var(--color-text-primary)] relative">
      <div className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={onLeave} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#262628] border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
              {friend.avatar_url ? (
                <img src={friend.avatar_url.startsWith('http') ? friend.avatar_url : `${API_URL}${friend.avatar_url}`} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={20} className="text-[var(--color-text-secondary)]" />
              )}
            </div>
            <div>
              <div className="font-bold">{friend.display_name || friend.username}</div>
              <div className="text-xs text-[var(--color-text-secondary)]">@{friend.username}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-white/10 rounded-full text-[var(--color-text-secondary)] hover:text-white transition-colors" title="Video Call (Soon)">
            <Video size={20} />
          </button>
          <button className="p-2 hover:bg-white/10 rounded-full text-[var(--color-text-secondary)] hover:text-white transition-colors" title="Voice Call (Soon)">
            <Mic size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 pb-24">
        {messages.map((m, i) => {
          const isMine = m.senderId === user?.id;
          const prevMsg = i > 0 ? messages[i-1] : null;
          const nextMsg = i < messages.length - 1 ? messages[i+1] : null;
          
          const isFirstInGroup = !prevMsg || prevMsg.senderId !== m.senderId;
          const isLastInGroup = !nextMsg || nextMsg.senderId !== m.senderId;

          let borderRadiusClass = "rounded-2xl";
          if (isMine) {
            if (!isFirstInGroup && !isLastInGroup) borderRadiusClass = "rounded-l-2xl rounded-tr-sm rounded-br-sm";
            else if (!isFirstInGroup && isLastInGroup) borderRadiusClass = "rounded-l-2xl rounded-tr-sm rounded-br-2xl";
            else if (isFirstInGroup && !isLastInGroup) borderRadiusClass = "rounded-l-2xl rounded-tr-2xl rounded-br-sm";
          } else {
            if (!isFirstInGroup && !isLastInGroup) borderRadiusClass = "rounded-r-2xl rounded-tl-sm rounded-bl-sm";
            else if (!isFirstInGroup && isLastInGroup) borderRadiusClass = "rounded-r-2xl rounded-tl-sm rounded-bl-2xl";
            else if (isFirstInGroup && !isLastInGroup) borderRadiusClass = "rounded-r-2xl rounded-tl-2xl rounded-bl-sm";
          }

          return (
            <div 
              key={i} 
              className={`flex flex-col max-w-[75%] ${isMine ? 'self-end items-end' : 'self-start items-start'} ${isFirstInGroup ? 'mt-3' : 'mt-[2px]'}`}
            >
              <div 
                className={`px-4 py-2.5 ${borderRadiusClass} ${
                  isMine 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-[#262628] text-white border border-white/5'
                }`}
                style={{ wordBreak: 'break-word' }}
              >
                {m.content}
              </div>
              {isLastInGroup && (
                <div className="text-[10px] text-[var(--color-text-secondary)] mt-1 px-1">
                  {m.time}
                </div>
              )}
            </div>
          );
        })}
        
        {partnerTyping && (
          <div className="flex flex-col max-w-[75%] self-start items-start mt-3">
             <div className="bg-[#262628] border border-white/5 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-[var(--color-text-secondary)] rounded-full animate-bounce" />
                </div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0F1015] via-[#0F1015]/90 to-transparent pt-10">
        <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto backdrop-blur-xl bg-white/5 border border-white/10 p-2 rounded-2xl">
          <input 
            type="text" 
            value={input}
            onChange={handleTyping}
            placeholder="iMessage..."
            className="flex-1 bg-transparent px-4 py-2 outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]"
          />
          <button 
            type="submit"
            disabled={!input.trim()}
            className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-11 h-11 shrink-0"
          >
            <Send size={18} className={input.trim() ? "translate-x-0.5" : ""} />
          </button>
        </form>
      </div>
    </div>
  );
};
