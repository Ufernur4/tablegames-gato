import { useState } from 'react';

const EMOJI_CATEGORIES = {
  '😀': ['😀','😂','🤣','😍','🥳','😎','🤩','😜','🤪','😤','🥺','😱','🤯','🥶','🤮','👻'],
  '👍': ['👍','👎','👏','🙌','🤝','✌️','🤞','💪','🫡','🖐️','👊','🫶','❤️','🔥','⭐','💎'],
  '🎮': ['🎮','🎯','🎲','🏆','🥇','🥈','🥉','⚽','🏀','🎳','⛳','🎱','♟️','🃏','🎰','🎪'],
  '🎉': ['🎉','🎊','🎁','🎈','✨','💫','🌟','💥','🎵','🎶','🔔','📢','💬','💭','🏴‍☠️','🚀'],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [category, setCategory] = useState(Object.keys(EMOJI_CATEGORIES)[0]);

  return (
    <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-xl shadow-xl p-2 w-64 animate-fade-in-up z-20">
      <div className="flex gap-1 mb-2 border-b border-border pb-2">
        {Object.keys(EMOJI_CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`text-base p-1 rounded-md transition-colors ${category === cat ? 'bg-primary/15' : 'hover:bg-secondary'}`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI_CATEGORIES[category as keyof typeof EMOJI_CATEGORIES].map(emoji => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="text-base p-1 rounded-md hover:bg-secondary transition-colors active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
