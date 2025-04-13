import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { motion } from 'framer-motion';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../contracts/contractConfig';

export default function AdminPanel() {
  const { address, isConnected } = useAccount();
  const [isAdmin, setIsAdmin] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fundAmount, setFundAmount] = useState("0.1");
  const [editingTier, setEditingTier] = useState<number | null>(null);
  const [newTierValue, setNewTierValue] = useState("0.005");
  const [newImplementationAddress, setNewImplementationAddress] = useState("");
  const [upgradeEnabled, setUpgradeEnabled] = useState(false);
  
  // Get contract owner - essential
  const { data: ownerAddress, refetch: refetchOwner } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'owner',
    query: {
      gcTime: 60000, // Keep data fresh for 1 minute
      staleTime: 30000, // Consider data stale after 30 seconds
    }
  });
  
  // Get essential game info with one call
  const { data: isPaused, refetch: refetchPaused } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'isPaused',
    query: {
      gcTime: 60000,
      staleTime: 30000,
    }
  });
  
  // Load these on demand to avoid RPC rate limiting
  const { data: gameBank, refetch: refetchBank } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getGameBank',
    query: {
      enabled: loadCount >= 1,
      gcTime: 30000, // Reduced from 60000 to refresh more often
      staleTime: 15000, // Reduced from 30000 to consider data stale sooner
    }
  });
  
  // Load these on demand to avoid RPC rate limiting
  const { data: creatorFees, refetch: refetchFees } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'creatorFees',
    query: {
      enabled: loadCount >= 2,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  // Load only when advanced view is enabled and after basic data
  const { data: contractBalance, refetch: refetchBalance } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getContractBalance',
    query: {
      enabled: loadCount >= 3,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  // Load tiers only when other data is loaded
  const { data: tier1Amount, refetch: refetchTier1 } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tierToAmount',
    args: [0],
    query: {
      enabled: loadCount >= 4,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  const { data: tier2Amount, refetch: refetchTier2 } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tierToAmount',
    args: [1],
    query: {
      enabled: loadCount >= 4,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  const { data: tier3Amount, refetch: refetchTier3 } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tierToAmount',
    args: [2],
    query: {
      enabled: loadCount >= 4,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  const { data: tier4Amount, refetch: refetchTier4 } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tierToAmount',
    args: [3],
    query: {
      enabled: loadCount >= 4,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  const { data: tier5Amount, refetch: refetchTier5 } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tierToAmount',
    args: [4],
    query: {
      enabled: loadCount >= 4,
      gcTime: 60000,
      staleTime: 30000,
    }
  });
  
  // Load implementation and upgrade status with other data
  const { data: currentImplementation } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'implementation',
    query: {
      enabled: loadCount >= 3,
      gcTime: 60000,
      staleTime: 30000,
    }
  });

  const { data: isUpgradeEnabled, refetch: refetchUpgradeStatus } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'upgradeEnabled',
    query: {
      enabled: loadCount >= 3,
      gcTime: 60000,
      staleTime: 30000,
    }
  });
  
  // Format MON with proper precision
  const formatMON = (amount: bigint | undefined | null): string => {
    if (!amount) return '0 MON';
    return Number(formatEther(amount)).toFixed(5) + ' MON';
  };
  
  // Transaction handling
  const { data: hash, writeContract, isPending } = useWriteContract();
  
  // Wait for transaction to be mined
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash,
  });
  
  // Check if user is admin - this is essential
  useEffect(() => {
    if (address && ownerAddress) {
      setIsAdmin(address === ownerAddress);
      // Start loading data sequentially
      setLoadCount(1);
    }
  }, [address, ownerAddress]);
  
  // Load data sequentially to avoid rate limiting
  useEffect(() => {
    if (loadCount === 1 && gameBank !== undefined) {
      // Bank loaded, now load fees
      setLoadCount(2);
    } else if (loadCount === 2 && creatorFees !== undefined) {
      // Fees loaded, now load contract balance
      setLoadCount(3);
    } else if (loadCount === 3 && contractBalance !== undefined) {
      // Contract balance loaded, load tiers
      setLoadCount(4);
    }
  }, [loadCount, gameBank, creatorFees, contractBalance]);

  // Also load advanced data when advanced view is toggled
  useEffect(() => {
    if (showAdvanced && loadCount < 3 && loadCount > 0) {
      setLoadCount(3);
    }
  }, [showAdvanced, loadCount]);
  
  // Update state after successful transaction
  useEffect(() => {
    if (txSuccess) {
      refetchOwner();
      refetchPaused();
      refetchBank();
      refetchFees();
      refetchBalance();
      refetchUpgradeStatus();
      
      if (loadCount >= 4) {
        refetchTier1();
        refetchTier2();
        refetchTier3();
        refetchTier4();
        refetchTier5();
      }
      
      // Reset load count to trigger reload of other data
      setLoadCount(1);
      setTxError(null);
      
      // Clear editing state if transaction was successful
      setEditingTier(null);
      
      // Reset implementation address input after update
      if (newImplementationAddress) {
        setNewImplementationAddress("");
      }
    }
  }, [txSuccess, refetchOwner, refetchPaused, refetchBank, refetchFees, refetchBalance, 
      refetchTier1, refetchTier2, refetchTier3, refetchTier4, refetchTier5, loadCount, 
      refetchUpgradeStatus, newImplementationAddress]);
  
  // Handle pause/unpause game
  const handleTogglePause = () => {
    if (!isAdmin) return;
    
    setTxError(null);
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setPaused',
        args: [!isPaused]
      });
    } catch (error: any) {
      setTxError(error.message || 'Error toggling game state');
    }
  };
  
  // Handle withdraw creator fees
  const handleWithdrawFees = () => {
    if (!isAdmin) return;
    
    setTxError(null);
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'withdrawCreatorFees'
      });
    } catch (error: any) {
      setTxError(error.message || 'Error withdrawing fees');
    }
  };

  // Handle fund contract
  const handleFundContract = () => {
    if (!isAdmin) return;
    
    setTxError(null);
    try {
      console.log("Funding contract with:", fundAmount, "MON");
      const fundValue = parseEther(fundAmount);
      
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'addFunds',
        value: fundValue
      }, {
        onSuccess(data) {
          console.log("Funding transaction submitted successfully:", data);
        },
        onError(error) {
          console.error("Funding error:", error);
          setTxError(error.message || 'Error funding contract');
        }
      });
    } catch (error: any) {
      console.error("Error preparing funding transaction:", error);
      setTxError(error.message || 'Error funding contract');
    }
  };

  // Handle emergency withdraw
  const handleEmergencyWithdraw = () => {
    if (!isAdmin) {
      console.log("Emergency withdraw aborted: User is not admin");
      return;
    }
    
    if (!isPaused) {
      setTxError("Game must be paused before using emergency withdrawal");
      return;
    }
    
    setTxError(null);
    try {
      console.log("Starting emergency withdraw process");
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'emergencyWithdraw',
      }, {
        onSuccess(data) {
          console.log("Emergency withdraw submitted successfully:", data);
        },
        onError(error) {
          console.error("Emergency withdraw error:", error);
        }
      });
    } catch (error: any) {
      console.error("Emergency withdraw error:", error);
      setTxError(error.message || 'Error with emergency withdrawal');
    }
  };
  
  // Handle setting tier amount
  const handleSetTierAmount = (tier: number) => {
    if (!isAdmin || editingTier === null) return;
    
    setTxError(null);
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setTierAmount',
        args: [tier, parseEther(newTierValue)]
      });
    } catch (error: any) {
      setTxError(error.message || 'Error setting tier amount');
    }
  };
  
  // Function to trigger manual refresh
  const handleManualRefresh = () => {
    // Reset loading sequence
    setLoadCount(0); // Reset to 0 instead of 1 to force a complete reload
    setTimeout(() => {
      refetchBank();
      refetchFees();
      refetchBalance();
      refetchOwner();
      refetchPaused();
      setLoadCount(1);
    }, 100);
  };
  
  // Function to start editing a tier
  const startEditingTier = (tier: number, currentValue: bigint | undefined) => {
    setEditingTier(tier);
    // Gérer le cas où currentValue est undefined
    if (currentValue === undefined) {
      setNewTierValue("0");
    } else {
      setNewTierValue(formatEther(currentValue));
    }
  };
  
  // Function to cancel editing
  const cancelEditing = () => {
    setEditingTier(null);
  };
  
  // Fonction pour activer/désactiver les mises à jour
  const handleToggleUpgrade = () => {
    if (!isAdmin) return;
    
    setTxError(null);
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setUpgradeEnabled',
        args: [!upgradeEnabled]
      });
    } catch (error: any) {
      setTxError(error.message || 'Error toggling upgrade status');
    }
  };
  
  // Fonction pour mettre à jour l'implémentation
  const handleUpdateImplementation = () => {
    if (!isAdmin) return;
    if (!newImplementationAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setTxError("Invalid address format");
      return;
    }
    
    setTxError(null);
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'updateImplementation',
        args: [newImplementationAddress as `0x${string}`]
      });
    } catch (error: any) {
      setTxError(error.message || 'Error updating implementation');
    }
  };
  
  // Handle contract bank sync (recalculate based on actual balance)
  const handleSyncGameBank = () => {
    if (!isAdmin) return;
    
    setTxError(null);
    try {
      console.log("Syncing contract bank with actual balance");
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'syncGameBank',
      }, {
        onSuccess(data) {
          console.log("Bank sync transaction submitted successfully:", data);
        },
        onError(error) {
          console.error("Bank sync error:", error);
          setTxError(error.message || 'Error syncing game bank');
        }
      });
    } catch (error: any) {
      console.error("Error preparing bank sync transaction:", error);
      setTxError(error.message || 'Error syncing game bank');
    }
  };
  
  // Section Emergency Withdraw et Contract Management
  const EmergencyFunctionsSection = () => {
    return (
      <div className="mt-8 bg-red-900/20 p-6 rounded-lg border border-red-900/30">
        <h3 className="text-lg font-medium mb-4 text-red-400">Emergency Functions</h3>
        
        <div className="space-y-6">
          {/* Emergency Withdraw */}
          <div>
            <h4 className="font-medium mb-2">Emergency Withdrawal</h4>
            <p className="text-sm text-gray-400 mb-4">
              This function allows you to withdraw all funds from the contract in case of emergency.
              <strong className="block mt-1 text-red-400">Game must be paused first!</strong>
            </p>
            
            <div className="flex justify-center">
              <motion.button
                className="btn btn-error"
                onClick={handleEmergencyWithdraw}
                disabled={isPending || !isPaused}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isPending ? 'Processing...' : 'Emergency Withdraw'}
              </motion.button>
            </div>
          </div>
          
          {/* Contract Updates */}
          <div className="pt-4 border-t border-red-900/30">
            <h4 className="font-medium mb-2">Contract Update Management</h4>
            <p className="text-sm text-gray-400 mb-4">
              These functions allow you to update the contract implementation without redeploying.
            </p>
            
            {typeof currentImplementation !== 'undefined' && (
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-400">Current Implementation:</p>
                <p className="text-xs font-mono break-all">{typeof currentImplementation === 'string' ? currentImplementation : String(currentImplementation)}</p>
                <p className="text-sm text-gray-400 mt-2">
                  Upgrade Status: <span className={Boolean(isUpgradeEnabled) ? "text-green-400" : "text-red-400"}>
                    {Boolean(isUpgradeEnabled) ? "Enabled" : "Disabled"}
                  </span>
                </p>
              </div>
            )}
            
            <div className="flex flex-col space-y-4">
              {/* Toggle Upgrade Status */}
              <div className="flex justify-center">
                <motion.button
                  className="btn btn-warning"
                  onClick={handleToggleUpgrade}
                  disabled={isPending}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isPending ? 'Processing...' : isUpgradeEnabled ? 'Disable Upgrades' : 'Enable Upgrades'}
                </motion.button>
              </div>
              
              {/* Update Implementation */}
              <div className="flex flex-col items-center space-y-2">
                <input
                  type="text"
                  placeholder="New Implementation Address (0x...)"
                  value={newImplementationAddress}
                  onChange={(e) => setNewImplementationAddress(e.target.value)}
                  className="input input-bordered w-full max-w-xs"
                />
                <motion.button
                  className="btn btn-warning"
                  onClick={handleUpdateImplementation}
                  disabled={isPending || !isUpgradeEnabled}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isPending ? 'Processing...' : 'Update Implementation'}
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  if (!isConnected) {
    return (
      <div className="text-center py-8">
        <p>Please connect your wallet to access admin features</p>
      </div>
    );
  }
  
  if (!isAdmin) {
    return (
      <div className="text-center py-8">
        <p>You do not have admin access to this contract</p>
        <p className="text-sm text-gray-500 mt-2">
          Connected: {address}<br/>
          Owner: {ownerAddress ? ownerAddress.toString() : 'Loading...'}
        </p>
      </div>
    );
  }
  
  return (
    <motion.div 
      className="card max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-accent">Admin Panel</h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="btn btn-sm btn-secondary"
          >
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </button>
          <button 
            onClick={handleManualRefresh}
            className="btn btn-sm btn-ghost"
            aria-label="Refresh data"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-card/50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-2">Game Bank</h3>
          {gameBank !== undefined ? (
            <div>
              <p className="text-xl font-bold">
                {formatMON(gameBank as bigint)}
              </p>
              {contractBalance !== undefined && (gameBank !== contractBalance) && (
                <div className="mt-2 text-sm text-amber-400">
                  <p>Contract balance: {formatMON(contractBalance as bigint)}</p>
                  <button
                    className="btn btn-xs btn-warning mt-2"
                    onClick={handleSyncGameBank}
                    disabled={isPending}
                  >
                    {isPending ? 'Syncing...' : 'Sync Bank Data'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400">Loading...</p>
          )}
        </div>
        
        <div className="bg-card/50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-2">Creator Fees</h3>
          {creatorFees !== undefined ? (
            <>
              <p className="text-xl font-bold text-green-400">
                {formatMON(creatorFees as bigint)}
              </p>
              
              {Number(creatorFees) > 0 && (
                <motion.button
                  className="btn btn-primary mt-3"
                  onClick={handleWithdrawFees}
                  disabled={isPending}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isPending ? 'Withdrawing...' : 'Withdraw Fees'}
                </motion.button>
              )}
            </>
          ) : (
            <p className="text-gray-400">Loading...</p>
          )}
        </div>
      </div>

      {/* Section de financement du contrat - Toujours visible */}
      <div className="bg-card/50 p-6 rounded-lg text-center mb-8">
        <h3 className="text-lg font-medium mb-4">Fund Contract</h3>
        {contractBalance !== undefined ? (
          <>
            <p className="text-xl font-bold mb-4">
              Balance: {formatMON(contractBalance as bigint)}
            </p>

            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <div className="flex items-center">
                <input 
                  type="number" 
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="input input-bordered w-28 mr-2"
                  step="0.01"
                  min="0"
                />
                <span>MON</span>
              </div>

              <motion.button
                className="btn btn-accent"
                onClick={handleFundContract}
                disabled={isPending}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isPending ? 'Processing...' : 'Fund Contract'}
              </motion.button>
            </div>
          </>
        ) : (
          <p className="text-gray-400">Loading balance data...</p>
        )}
      </div>
      
      <div className="bg-card/50 p-6 rounded-lg text-center">
        <h3 className="text-lg font-medium mb-4">Game Status</h3>
        {isPaused !== undefined ? (
          <>
            <div className="flex justify-center mb-4">
              <div className={`px-4 py-2 rounded-full ${
                isPaused ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'
              }`}>
                {isPaused ? 'Game Paused' : 'Game Active'}
              </div>
            </div>
            
            <motion.button
              className={`btn ${isPaused ? 'btn-secondary' : 'btn-accent'}`}
              onClick={handleTogglePause}
              disabled={isPending}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isPending ? 'Processing...' : isPaused ? 'Unpause Game' : 'Pause Game'}
            </motion.button>
          </>
        ) : (
          <p className="text-gray-400">Loading...</p>
        )}
      </div>

      {/* Emergency Withdraw et Contract Management */}
      <EmergencyFunctionsSection />

      {/* Section des tiers de mise - Affichage conditionné par l'existence des données, pas par showAdvanced */}
      {tier1Amount !== undefined && (
        <div className="mt-8 bg-card/50 p-6 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Bet Tiers Configuration</h3>
          <p className="text-sm text-gray-400 mb-3">Click on a tier to edit its amount.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className={`bg-gray-800/50 p-3 rounded-lg cursor-pointer transition-all ${editingTier === 0 ? 'ring-2 ring-accent' : 'hover:bg-gray-700/50'}`}
              onClick={() => editingTier === null ? startEditingTier(0, tier1Amount as bigint) : null}
            >
              <h4 className="font-medium mb-1 text-center">Tier 1</h4>
              {editingTier === 0 ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      value={newTierValue}
                      onChange={(e) => setNewTierValue(e.target.value)}
                      className="input input-bordered input-sm w-24 mr-2"
                      step="0.001"
                      min="0"
                    />
                    <span>MON</span>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-xs btn-success"
                      onClick={() => handleSetTierAmount(0)}
                      disabled={isPending}
                    >
                      {isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="btn btn-xs btn-ghost"
                      onClick={cancelEditing}
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center font-bold">{formatMON(tier1Amount as bigint)}</p>
              )}
            </div>
            
            <div 
              className={`bg-gray-800/50 p-3 rounded-lg cursor-pointer transition-all ${editingTier === 1 ? 'ring-2 ring-accent' : 'hover:bg-gray-700/50'}`}
              onClick={() => editingTier === null ? startEditingTier(1, tier2Amount as bigint) : null}
            >
              <h4 className="font-medium mb-1 text-center">Tier 2</h4>
              {editingTier === 1 ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      value={newTierValue}
                      onChange={(e) => setNewTierValue(e.target.value)}
                      className="input input-bordered input-sm w-24 mr-2"
                      step="0.001"
                      min="0"
                    />
                    <span>MON</span>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-xs btn-success"
                      onClick={() => handleSetTierAmount(1)}
                      disabled={isPending}
                    >
                      {isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="btn btn-xs btn-ghost"
                      onClick={cancelEditing}
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center font-bold">{formatMON(tier2Amount as bigint)}</p>
              )}
            </div>
            
            <div 
              className={`bg-gray-800/50 p-3 rounded-lg cursor-pointer transition-all ${editingTier === 2 ? 'ring-2 ring-accent' : 'hover:bg-gray-700/50'}`}
              onClick={() => editingTier === null ? startEditingTier(2, tier3Amount as bigint) : null}
            >
              <h4 className="font-medium mb-1 text-center">Tier 3</h4>
              {editingTier === 2 ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      value={newTierValue}
                      onChange={(e) => setNewTierValue(e.target.value)}
                      className="input input-bordered input-sm w-24 mr-2"
                      step="0.001"
                      min="0"
                    />
                    <span>MON</span>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-xs btn-success"
                      onClick={() => handleSetTierAmount(2)}
                      disabled={isPending}
                    >
                      {isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="btn btn-xs btn-ghost"
                      onClick={cancelEditing}
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center font-bold">{formatMON(tier3Amount as bigint)}</p>
              )}
            </div>
            
            <div 
              className={`bg-gray-800/50 p-3 rounded-lg cursor-pointer transition-all ${editingTier === 3 ? 'ring-2 ring-accent' : 'hover:bg-gray-700/50'}`}
              onClick={() => editingTier === null ? startEditingTier(3, tier4Amount as bigint) : null}
            >
              <h4 className="font-medium mb-1 text-center">Tier 4</h4>
              {editingTier === 3 ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      value={newTierValue}
                      onChange={(e) => setNewTierValue(e.target.value)}
                      className="input input-bordered input-sm w-24 mr-2"
                      step="0.001"
                      min="0"
                    />
                    <span>MON</span>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-xs btn-success"
                      onClick={() => handleSetTierAmount(3)}
                      disabled={isPending}
                    >
                      {isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="btn btn-xs btn-ghost"
                      onClick={cancelEditing}
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center font-bold">{formatMON(tier4Amount as bigint)}</p>
              )}
            </div>
            
            <div 
              className={`bg-gray-800/50 p-3 rounded-lg cursor-pointer transition-all ${editingTier === 4 ? 'ring-2 ring-accent' : 'hover:bg-gray-700/50'}`}
              onClick={() => editingTier === null ? startEditingTier(4, tier5Amount as bigint) : null}
            >
              <h4 className="font-medium mb-1 text-center">Tier 5</h4>
              {editingTier === 4 ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      value={newTierValue}
                      onChange={(e) => setNewTierValue(e.target.value)}
                      className="input input-bordered input-sm w-24 mr-2"
                      step="0.001"
                      min="0"
                    />
                    <span>MON</span>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-xs btn-success"
                      onClick={() => handleSetTierAmount(4)}
                      disabled={isPending}
                    >
                      {isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="btn btn-xs btn-ghost"
                      onClick={cancelEditing}
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center font-bold">{formatMON(tier5Amount as bigint)}</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {txError && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 p-4 rounded-lg mt-6">
          <p>{txError}</p>
        </div>
      )}

      <div className="mt-8 text-center text-xs text-gray-500">
        <p>Contract Address: {CONTRACT_ADDRESS}</p>
        <p className="mt-1">Admin Address: {ownerAddress ? ownerAddress.toString() : 'Loading...'}</p>
      </div>
    </motion.div>
  );
} 