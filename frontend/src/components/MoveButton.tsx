import React from 'react';

type MoveButtonProps = {
  moveValue: number;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
};

const MoveButton: React.FC<MoveButtonProps> = ({ 
  moveValue, 
  selected, 
  onClick, 
  disabled 
}) => {
  const moveNames = ['Rock', 'Paper', 'Scissors'];
  const moveEmojis = ['🪨', '📄', '✂️'];
  
  console.log(`Rendering MoveButton: value=${moveValue}, selected=${selected}, disabled=${disabled}`);
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center 
        p-6 rounded-lg transition-all
        w-28 h-32
        ${selected ? 'bg-purple-700 text-white scale-105 shadow-lg' : 'bg-gray-700 hover:bg-gray-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-center justify-center h-16">
        <span className="text-4xl">{moveEmojis[moveValue]}</span>
      </div>
      <span className="font-medium mt-2">{moveNames[moveValue]}</span>
    </button>
  );
};

export default MoveButton; 