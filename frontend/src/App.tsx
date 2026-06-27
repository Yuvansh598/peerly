import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { Chat } from './components/Chat';
import { VideoChat } from './components/VideoChat';
import { FriendChat } from './components/FriendChat';
import { Dashboard } from './components/Dashboard';
import { socket, connectSocket } from './socket';
import { useAuthStore } from './store';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';

function App() {
  const { token, user } = useAuthStore();
  const [inChat, setInChat] = useState(false);
  const [chatType, setChatType] = useState<'random_text' | 'random_video' | 'random_voice'>('random_text');
  const [chatTags, setChatTags] = useState<string[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);

  useEffect(() => {
    if (token) {
      connectSocket(token);
    }
  }, [token]);

  const handleStartChat = (type: 'random_text' | 'random_video' | 'random_voice' = 'random_text', tags: string[] = []) => {
    setChatType(type);
    setChatTags(tags);
    setInChat(true);
  };

  const handleLeaveChat = () => {
    setInChat(false);
    setSelectedFriend(null);
    socket.emit('match:leave');
  };

  const renderContent = () => {
    // If user is actively in a chat
    if (inChat) {
      if (chatType === 'random_video' || chatType === 'random_voice') {
        return <VideoChat guest={user} onLeave={handleLeaveChat} tags={chatTags} type={chatType} />;
      }
      return <Chat guest={user} onLeave={handleLeaveChat} tags={chatTags} />;
    }

    // If user clicked on a friend
    if (selectedFriend) {
      return <FriendChat friend={selectedFriend} onLeave={handleLeaveChat} />;
    }

    // If user is logged in as a registered user
    if (user && user.type === 'user') {
      return <Dashboard onStartChat={handleStartChat} onStartFriendChat={setSelectedFriend} />;
    }

    // Fallback for guests and logged-out users
    return <LandingPage onStart={handleStartChat} />;
  };

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || "541369775233-g2p7l6kr6nm6sks3khhg77n36a3in5id.apps.googleusercontent.com"}>
      <Toaster position="top-center" toastOptions={{ style: { background: '#1C2238', color: '#E8EEFF', border: '1px solid #232B47' } }} />
      {renderContent()}
    </GoogleOAuthProvider>
  );
}

export default App;
