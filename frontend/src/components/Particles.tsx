import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ParticlesProps {
  type: 'win' | 'levelUp' | 'achievement';
  duration?: number;
}

const PARTICLE_COLORS = {
  win: ['#4ADE80', '#34D399', '#10B981'],
  levelUp: ['#8B5CF6', '#6366F1', '#3B82F6'],
  achievement: ['#F59E0B', '#FBBF24', '#FCD34D']
};

const Particles = ({ type, duration = 2000 }: ParticlesProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = PARTICLE_COLORS[type];
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const particleCount = 50;
    
    // Create particles
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      
      // Random position
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      
      // Random size
      const size = Math.random() * 8 + 4;
      
      // Random color
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      // Apply styles
      Object.assign(particle.style, {
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}px`,
        height: `${size}px`,
        background: color,
        position: 'absolute',
        borderRadius: '50%',
        pointerEvents: 'none',
        transform: 'translate(-50%, -50%)'
      });
      
      // Add animation
      particle.animate(
        [
          {
            transform: 'translate(-50%, -50%) scale(0)',
            opacity: 1
          },
          {
            transform: `translate(
              ${(Math.random() - 0.5) * 200}px,
              ${(Math.random() - 0.5) * 200}px
            ) scale(1)`,
            opacity: 0
          }
        ],
        {
          duration: Math.random() * 1000 + 1000,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards'
        }
      );
      
      container.appendChild(particle);
      
      // Cleanup
      setTimeout(() => {
        particle.remove();
      }, duration);
    }
  }, [type, duration, colors]);
  
  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className="particles"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      />
    </AnimatePresence>
  );
};

export default Particles; 