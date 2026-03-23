import { useState, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface ChatPanelProps {
  userId: string;
  gameId?: string;
  title?: string;
}

export function ChatPanel({ userId, gameId, title = 'Lobby Chat' }: ChatPanelProps) {
  const { messages, sendMessage, bottomRef } = useChat(gameId);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!text.trim()) return;
    await sendMessage(userId, text);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Noch keine Nachrichten…
          </p>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`text-sm ${msg.user_id === userId ? 'text-right' : ''}`}
          >
            <span className="text-[10px] text-muted-foreground font-medium">
              {msg.display_name || msg.user_id.slice(0, 8)}
            </span>
            <div
              className={`inline-block rounded-lg px-3 py-1.5 mt-0.5 max-w-[85%] text-left break-words ${
                msg.user_id === userId
                  ? 'bg-primary/15 text-foreground ml-auto'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-border flex gap-2">
        <Input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Nachricht…"
          className="bg-secondary border-border text-sm h-8"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!text.trim()}
          className="h-8 w-8 p-0 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
