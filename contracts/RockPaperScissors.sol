// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RockPaperScissors {
    enum Move { Rock, Paper, Scissors }
    enum BetTier { TIER_1, TIER_2, TIER_3, TIER_4, TIER_5 }
    enum GameState { None, Played }

    struct PendingReward {
        uint256 amount;
        bool claimed;
    }

    struct PlayerStats {
        uint256 lastPlayTime;
        uint256 totalWins;
    }

    // Variable pour protéger contre la réentrance
    bool private locked;

    address public owner;
    uint256 public creatorFees;
    uint256 public gameBank;
    bool public isPaused = false;
    uint256 public constant COOLDOWN = 15; // secondes entre deux parties
    
    mapping(BetTier => uint256) public tierToAmount;
    mapping(address => PlayerStats) public playerStats;
    mapping(address => PendingReward[]) public pendingRewards;
    
    event GamePlayed(
        address indexed player,
        Move playerMove,
        Move contractMove,
        string result,
        uint256 netWin
    );
    event RewardClaimed(address indexed player, uint256 index, uint256 amount);
    event CreatorFeesWithdrawn(uint256 amount);
    event Paused(bool status);
    event EmergencyWithdrawal(address indexed receiver, uint256 amount);
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event GameBankSynced(uint256 newAmount);

    error InvalidRewardIndex();
    error RewardAlreadyClaimed();
    error TransferFailed();

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notPaused() {
        require(!isPaused, "Game is paused");
        _;
    }
    
    modifier validBetAmount(uint256 amount) {
        require(msg.value == amount, "Incorrect ETH amount sent");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "ReentrancyGuard: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        owner = msg.sender;
        tierToAmount[BetTier.TIER_1] = 0.005 ether;
        tierToAmount[BetTier.TIER_2] = 0.01 ether;
        tierToAmount[BetTier.TIER_3] = 0.025 ether;
        tierToAmount[BetTier.TIER_4] = 0.05 ether;
        tierToAmount[BetTier.TIER_5] = 0.1 ether;
    }
    
    function playGame(Move playerMove, BetTier tier) external payable nonReentrant notPaused validBetAmount(tierToAmount[tier]) {
        require(block.timestamp >= playerStats[msg.sender].lastPlayTime + COOLDOWN, "Wait before playing again");
        uint256 betAmount = tierToAmount[tier];
        
        // Générer le coup du contrat - version simplifiée
        Move contractMove = Move(uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            msg.sender,
            playerMove
        ))) % 3);
        
        // Déterminer le résultat
        string memory result;
        uint256 netGain = 0;
        
        if (_didPlayerWin(playerMove, contractMove)) {
            // Win: 192% (gain = 92%)
            uint256 payout = betAmount + (betAmount * 92) / 100;
            netGain = (betAmount * 92) / 100;

            pendingRewards[msg.sender].push(PendingReward(payout, false));
            creatorFees += (betAmount * 3) / 100;
            gameBank += (betAmount * 7) / 100;
            playerStats[msg.sender].totalWins += 1;

            result = "Win";
        } else if (playerMove == contractMove) {
            // Draw: refund 98%, 2% creator
            uint256 refund = (betAmount * 98) / 100;
            pendingRewards[msg.sender].push(PendingReward(refund, false));
            creatorFees += (betAmount * 2) / 100;

            result = "Draw";
        } else {
            // Lose: 3% creator, 97% game bank
            creatorFees += (betAmount * 3) / 100;
            gameBank += (betAmount * 97) / 100;

            result = "Lose";
        }
        
        // Mettre à jour le timestamp de la dernière partie
        playerStats[msg.sender].lastPlayTime = block.timestamp;
        
        emit GamePlayed(msg.sender, playerMove, contractMove, result, netGain);
    }
    
    function _didPlayerWin(Move player, Move ai) internal pure returns (bool) {
        return (player == Move.Rock && ai == Move.Scissors) ||
               (player == Move.Paper && ai == Move.Rock) ||
               (player == Move.Scissors && ai == Move.Paper);
    }

    function claimReward(uint256 index) external nonReentrant {
        PendingReward[] storage rewards = pendingRewards[msg.sender];
        if (index >= rewards.length) revert InvalidRewardIndex();
        if (rewards[index].claimed) revert RewardAlreadyClaimed();

        uint256 amount = rewards[index].amount;
        rewards[index].claimed = true;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit RewardClaimed(msg.sender, index, amount);
    }

    function withdrawCreatorFees() external nonReentrant onlyOwner {
        uint256 amount = creatorFees;
        creatorFees = 0;

        (bool success, ) = owner.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit CreatorFeesWithdrawn(amount);
    }

    function setPaused(bool status) external onlyOwner {
        isPaused = status;
        emit Paused(status);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        (bool success, ) = owner.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit EmergencyWithdrawal(owner, amount);
    }

    // Fonction pour recevoir des ETH
    receive() external payable {
        gameBank += msg.value;
    }

    // Récupérer le nombre de récompenses en attente
    function getPendingRewardCount(address player) external view returns (uint256) {
        return pendingRewards[player].length;
    }

    // Récupérer le dernier timestamp de jeu d'un joueur
    function lastPlayTimestamp(address player) external view returns (uint256) {
        return playerStats[player].lastPlayTime;
    }
    
    // Récupérer le nombre total de victoires d'un joueur
    function playerTotalWins(address player) external view returns (uint256) {
        return playerStats[player].totalWins;
    }

    // Mettre à jour les montants de mise (avec vérification de sécurité)
    function updateTierAmount(BetTier tier, uint256 amount) external onlyOwner {
        require(amount <= MAX_BET_AMOUNT, "Amount exceeds maximum allowed bet");
        tierToAmount[tier] = amount;
    }

    // Synchroniser la banque du jeu avec le solde réel du contrat
    function syncGameBank() external onlyOwner {
        uint256 totalBalance = address(this).balance;
        // Conserver les frais du créateur inchangés
        uint256 newGameBank = totalBalance - creatorFees;
        gameBank = newGameBank;
        emit GameBankSynced(gameBank);
    }

    // Obtenir le montant accumulé dans la banque du jeu
    function getGameBank() external view returns (uint256) {
        return gameBank;
    }
    
    // Obtenir le solde total du contrat
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Fonction de compatibilité (obsolète)
    function commitMove(bytes32 moveHash, BetTier tier) external payable notPaused {
        revert("This function is deprecated. Use playGame instead.");
    }
    
    // Fonction de compatibilité (obsolète)
    function revealMove(Move playerMove, bytes32 salt) external notPaused {
        revert("This function is deprecated. Use playGame instead.");
    }
    
    // Fonction de compatibilité (obsolète)
    function play(BetTier tier, Move playerMove) external payable notPaused {
        revert("This function is deprecated. Use playGame instead.");
    }

    // Fonction explicite pour ajouter des fonds au contrat
    function addFunds() external payable {
        gameBank += msg.value;
    }
} 