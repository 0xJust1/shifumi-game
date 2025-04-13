import React, { useState, useEffect } from 'react';
import { 
  playGame, 
  getPlayerStats, 
  checkPendingReward, 
  claimReward,
  Move,
  BetTier,
  DEFAULT_BET_AMOUNTS
} from '../utils/contractInteraction';
import './GameInterface.css';

// ... existing code ...