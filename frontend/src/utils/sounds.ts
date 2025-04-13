import { Howl } from 'howler';

// Create sound instances for reuse
const soundCache = new Map<string, Howl>();

// Generic function to play a sound with caching
const playSound = (src: string, volume = 0.5, loop = false) => {
  // Check if sound exists in cache
  if (!soundCache.has(src)) {
    // Create new Howl instance and cache it
    soundCache.set(src, new Howl({
      src: [src],
      volume,
      loop
    }));
  }
  
  // Get sound from cache and play
  const sound = soundCache.get(src);
  if (sound) {
    // If the sound is already playing, stop it and restart
    if (sound.playing()) {
      sound.stop();
    }
    sound.play();
  }
};

// Export individual sound functions
export const playHover = () => playSound('/sounds/hover.mp3', 0.2);
export const playSelect = () => playSound('/sounds/click.mp3', 0.5);
export const playWin = () => playSound('/sounds/win.mp3', 0.5);
export const playLose = () => playSound('/sounds/lose.mp3', 0.5);
export const playDraw = () => playSound('/sounds/draw.mp3', 0.5);
export const playLevelUp = () => playSound('/sounds/level-up.mp3', 0.7);
export const playAchievement = () => playSound('/sounds/achievement.mp3', 0.6);

// Preload sounds for faster playback
export const preloadSounds = () => {
  [
    '/sounds/hover.mp3',
    '/sounds/click.mp3',
    '/sounds/win.mp3',
    '/sounds/lose.mp3',
    '/sounds/draw.mp3',
    '/sounds/level-up.mp3', 
    '/sounds/achievement.mp3'
  ].forEach(src => {
    if (!soundCache.has(src)) {
      soundCache.set(src, new Howl({
        src: [src],
        preload: true
      }));
    }
  });
}; 