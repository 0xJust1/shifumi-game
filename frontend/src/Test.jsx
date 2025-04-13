import { useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contracts/contractConfig';

export default function Test() {
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function connectAndPlay() {
    try {
      setResult('Connecting...');
      setError('');

      // Connexion à Metamask
      if (!window.ethereum) {
        throw new Error("MetaMask n'est pas installé");
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      
      // Récupération du chainId
      const network = await provider.getNetwork();
      setResult(`Connecté au réseau ${network.name} (chainId: ${network.chainId})`);
      
      // Vérification que nous sommes sur Base Sepolia
      if (network.chainId !== 84532) {
        throw new Error(`Mauvais réseau. Veuillez vous connecter à Base Sepolia (84532). Vous êtes sur: ${network.chainId}`);
      }
      
      // Connexion au contrat
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Vérification que le jeu n'est pas en pause
      const isPaused = await contract.isPaused();
      if (isPaused) {
        throw new Error("Le jeu est en pause");
      }
      
      // Vérification que le cooldown est terminé
      const address = await signer.getAddress();
      const lastPlay = await contract.lastPlayTimestamp(address);
      const cooldown = await contract.COOLDOWN();
      const now = Math.floor(Date.now() / 1000);
      
      if (now < Number(lastPlay) + Number(cooldown)) {
        throw new Error(`Cooldown actif. Veuillez attendre ${Number(lastPlay) + Number(cooldown) - now} secondes.`);
      }
      
      // Récupération du montant de pari
      const betAmount = await contract.tierToAmount(0); // TIER_1
      
      // Vérification du solde
      const balance = await provider.getBalance(address);
      if (balance.lt(betAmount)) {
        throw new Error(`Solde insuffisant. Vous avez ${ethers.utils.formatEther(balance)} ETH, besoin de ${ethers.utils.formatEther(betAmount)} ETH.`);
      }
      
      // Vérification du solde du contrat
      const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
      const requiredBalance = betAmount.mul(192).div(100);
      
      if (contractBalance.lt(requiredBalance)) {
        throw new Error(`Le contrat n'a pas assez de fonds (${ethers.utils.formatEther(contractBalance)} ETH) pour payer une victoire potentielle (${ethers.utils.formatEther(requiredBalance)} ETH).`);
      }
      
      setResult(`Prêt à jouer! Pari: ${ethers.utils.formatEther(betAmount)} ETH. Appuyez sur Jouer.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Une erreur s'est produite");
    }
  }
  
  async function playGame() {
    try {
      setResult('Envoi de la transaction...');
      setError('');
      
      // Connexion à Metamask
      if (!window.ethereum) {
        throw new Error("MetaMask n'est pas installé");
      }
      
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      
      // Connexion au contrat
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Récupération du montant de pari
      const betAmount = await contract.tierToAmount(0); // TIER_1
      const move = 1; // Paper
      
      // Jouer
      const tx = await contract.play(0, move, { value: betAmount });
      setResult(`Transaction envoyée! Hash: ${tx.hash}`);
      
      // Attendre la confirmation
      const receipt = await tx.wait();
      setResult(`Transaction confirmée! Hash: ${receipt.transactionHash}`);
      
      // Récupérer les événements
      const event = receipt.events.find(e => e.event === 'GamePlayed');
      if (event) {
        const { playerMove, aiMove, result, netWin } = event.args;
        setResult(`Résultat: ${result}! Votre coup: ${playerMove}, IA: ${aiMove}, Gain: ${ethers.utils.formatEther(netWin)} ETH`);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Une erreur s'est produite");
    }
  }
  
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
      <h1 style={{ marginBottom: '20px' }}>Test ShiFUmi</h1>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={connectAndPlay}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Vérifier
        </button>
        
        <button 
          onClick={playGame}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Jouer (Paper)
        </button>
      </div>
      
      {result && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f0f9ff',
          borderRadius: '5px',
          border: '1px solid #bfdbfe'
        }}>
          {result}
        </div>
      )}
      
      {error && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#fee2e2',
          borderRadius: '5px',
          border: '1px solid #fecaca'
        }}>
          <strong>Erreur:</strong> {error}
        </div>
      )}
    </div>
  );
} 