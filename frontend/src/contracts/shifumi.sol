// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RockPaperScissors {
    enum Move { Rock, Paper, Scissors }
    enum BetTier { TIER_1, TIER_2, TIER_3, TIER_4, TIER_5 }

    struct PendingReward {
        uint256 amount;
        bool claimed;
    }

    address public owner;
    uint256 public creatorFees;
    uint256 public gameBank;
    bool public isPaused = false;
    uint256 public constant COOLDOWN = 15; // secondes entre deux parties

    mapping(BetTier => uint256) public tierToAmount;
    mapping(address => uint256) public lastPlayTimestamp;
    mapping(address => PendingReward[]) public pendingRewards;
    mapping(address => uint256) public playerTotalWins;

    event GamePlayed(address indexed player, Move playerMove, Move aiMove, string result, uint256 netWin);
    event RewardClaimed(address indexed player, uint256 index, uint256 amount);
    event CreatorFeesWithdrawn(uint256 amount);
    event Paused(bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notPaused() {
        require(!isPaused, "Game is paused");
        _;
    }

    constructor() {
        owner = msg.sender;
        tierToAmount[BetTier.TIER_1] = 0.005 ether;
        tierToAmount[BetTier.TIER_2] = 0.01 ether;
        tierToAmount[BetTier.TIER_3] = 0.025 ether;
        tierToAmount[BetTier.TIER_4] = 0.05 ether;
        tierToAmount[BetTier.TIER_5] = 0.1 ether;
    }

    function play(BetTier tier, Move playerMove) external payable notPaused {
        require(block.timestamp >= lastPlayTimestamp[msg.sender] + COOLDOWN, "Wait before playing again");
        uint256 betAmount = tierToAmount[tier];
        require(msg.value == betAmount, "Incorrect ETH amount sent");
        require(address(this).balance >= (betAmount * 192) / 100, "Not enough balance to pay win");

        lastPlayTimestamp[msg.sender] = block.timestamp;
        Move aiMove = _generateAIMove();
        string memory result;
        uint256 netGain = 0;

        if (_didPlayerWin(playerMove, aiMove)) {
            // Win: 192% (gain = 92%)
            uint256 payout = betAmount + (betAmount * 92) / 100;
            netGain = payout - betAmount;

            pendingRewards[msg.sender].push(PendingReward(payout, false));
            creatorFees += (betAmount * 3) / 100;
            gameBank += (betAmount * 7) / 100;
            playerTotalWins[msg.sender] += netGain;

            result = "Win";
        } else if (playerMove == aiMove) {
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

        emit GamePlayed(msg.sender, playerMove, aiMove, result, netGain);
    }

    function claimReward(uint256 index) external {
        require(index < pendingRewards[msg.sender].length, "Invalid index");
        PendingReward storage reward = pendingRewards[msg.sender][index];
        require(!reward.claimed, "Already claimed");
        require(address(this).balance >= reward.amount, "Insufficient balance");

        reward.claimed = true;
        (bool success, ) = payable(msg.sender).call{value: reward.amount}("");
        require(success, "Claim failed");

        emit RewardClaimed(msg.sender, index, reward.amount);
    }

    function claimAllRewards() external {
        PendingReward[] storage rewards = pendingRewards[msg.sender];
        uint256 totalToClaim = 0;

        for (uint256 i = 0; i < rewards.length; i++) {
            if (!rewards[i].claimed) {
                totalToClaim += rewards[i].amount;
                rewards[i].claimed = true;
            }
        }

        require(totalToClaim > 0, "No unclaimed rewards");
        require(address(this).balance >= totalToClaim, "Insufficient balance");

        (bool success, ) = payable(msg.sender).call{value: totalToClaim}("");
        require(success, "Claim failed");

        emit RewardClaimed(msg.sender, type(uint256).max, totalToClaim);
    }

    function getPendingRewardCount(address player) external view returns (uint256) {
        return pendingRewards[player].length;
    }

    function withdrawCreatorFees() external onlyOwner {
        require(creatorFees > 0, "No fees to withdraw");
        uint256 amount = creatorFees;
        creatorFees = 0;

        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Withdraw failed");

        emit CreatorFeesWithdrawn(amount);
    }

    function setPaused(bool _paused) external onlyOwner {
        isPaused = _paused;
        emit Paused(_paused);
    }

    function getGameBank() external view returns (uint256) {
        return gameBank;
    }

    function _generateAIMove() internal view returns (Move) {
        uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender)));
        return Move(random % 3);
    }

    function _didPlayerWin(Move player, Move ai) internal pure returns (bool) {
        return (player == Move.Rock && ai == Move.Scissors) ||
               (player == Move.Paper && ai == Move.Rock) ||
               (player == Move.Scissors && ai == Move.Paper);
    }

    receive() external payable {}
}