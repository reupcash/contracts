// SPDX-License-Identifier: reup.cash
pragma solidity ^0.8.19;

import "./Base/UpgradeableBase.sol";
import "./IRECurveZapper.sol";
import "./Library/CheapSafeERC20.sol";
import "./Base/REUSDMinterBase.sol";
import "./Library/CheapSafeCurve.sol";
import "./IRECurveBlargitrage.sol";

using CheapSafeERC20 for IERC20;
using CheapSafeERC20 for ICurveStableSwap;

contract RECurveZapper is REUSDMinterBase, UpgradeableBase(8), IRECurveZapper
{
    /*
        addWrapper(unwrappedToken, supportedButWrappedToken, wrapSig, unwrapSig);
        ^-- potential approach to future strategy for pools dealing with wrapped assets
    */
    bool public constant isRECurveZapper = true;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    ICurveStableSwap public immutable pool;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    ICurvePool public immutable basePool;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 public immutable basePoolToken;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 immutable poolCoin0;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 immutable poolCoin1;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 immutable basePoolCoin0;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 immutable basePoolCoin1;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 immutable basePoolCoin2;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 immutable basePoolCoin3;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    ICurveGauge public immutable gauge;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable basePoolCoinCount;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IRECurveBlargitrage immutable blargitrage;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(ICurveGauge _gauge, IREStablecoins _stablecoins, IRECurveBlargitrage _blargitrage)
        REUSDMinterBase(_blargitrage.custodian(), _blargitrage.REUSD(), _stablecoins)
    {
        /*
            Stableswap pools:
                Always have 2 coins
                One of them must be REUSD
                The pool token is always the pool itself
            Other pools:
                Have at least 2 coins
                We support 2-4 coins
                Must not include REUSD
        */
        assert(_blargitrage.isRECurveBlargitrage());
        
        gauge = _gauge;
        blargitrage = _blargitrage;
        basePool = _blargitrage.basePool();
        pool = gauge.lp_token();
        poolCoin0 = pool.coins(0); 
        poolCoin1 = pool.coins(1);
        basePoolToken = address(poolCoin0) == address(REUSD) ? poolCoin1 : poolCoin0;

        if (pool != _blargitrage.pool()) { revert PoolMismatch(); }

        basePoolCoin0 = basePool.coins(0);
        basePoolCoin1 = basePool.coins(1);
        uint256 count = 2;
        IERC20 _basePoolCoin2 = IERC20(address(0));
        IERC20 _basePoolCoin3 = IERC20(address(0));
        try basePool.coins(2) returns (IERC20Full coin2)
        {
            _basePoolCoin2 = coin2;
            count = 3;
            try basePool.coins(3) returns (IERC20Full coin3)
            {
                _basePoolCoin3 = coin3;
                count = 4;
            }
            catch {}
        }
        catch {}
        basePoolCoinCount = count;
        basePoolCoin2 = _basePoolCoin2;
        basePoolCoin3 = _basePoolCoin3;

        try pool.coins(2) returns (IERC20Full) { revert TooManyPoolCoins(); } catch {}
        try basePool.coins(4) returns (IERC20Full) { revert TooManyBasePoolCoins(); } catch {}        

        if (poolCoin0 != REUSD && poolCoin1 != REUSD) { revert MissingREUSD(); }
        if (basePoolCoin0 == REUSD || basePoolCoin1 == REUSD || basePoolCoin2 == REUSD || basePoolCoin3 == REUSD) { revert BasePoolWithREUSD(); }
    }

    function initialize()
        public
    {
        poolCoin0.safeApprove(address(pool), type(uint256).max);
        poolCoin1.safeApprove(address(pool), type(uint256).max);
        basePoolCoin0.safeApprove(address(basePool), type(uint256).max);
        basePoolCoin1.safeApprove(address(basePool), type(uint256).max);
        if (address(basePoolCoin2) != address(0)) { basePoolCoin2.safeApprove(address(basePool), type(uint256).max); }
        if (address(basePoolCoin3) != address(0)) { basePoolCoin3.safeApprove(address(basePool), type(uint256).max); }
        basePoolToken.safeApprove(address(basePool), type(uint256).max);
        pool.safeApprove(address(gauge), type(uint256).max);
    }
    
    function checkUpgradeBase(address newImplementation)
        internal
        override
        view
    {
        assert(IRECurveZapper(newImplementation).isRECurveZapper());
    }

    function isBasePoolToken(IERC20 token) 
        private
        view
        returns (bool)
    {
        return address(token) != address(0) &&
            (
                token == basePoolCoin0 ||
                token == basePoolCoin1 ||
                token == basePoolCoin2 ||
                token == basePoolCoin3
            );
    }

    function addBasePoolLiquidity(IERC20 token, uint256 amount)
        private
        returns (uint256)
    {
        uint256 amount0 = token == basePoolCoin0 ? amount : 0;
        uint256 amount1 = token == basePoolCoin1 ? amount : 0;
        if (basePoolCoinCount == 2)
        {
            return CheapSafeCurve.safeAddLiquidity(address(basePool), basePoolToken, [amount0, amount1], 0);
        }
        uint256 amount2 = token == basePoolCoin2 ? amount : 0;
        if (basePoolCoinCount == 3)
        {
            return CheapSafeCurve.safeAddLiquidity(address(basePool), basePoolToken, [amount0, amount1, amount2], 0);
        }
        uint256 amount3 = token == basePoolCoin3 ? amount : 0;
        return CheapSafeCurve.safeAddLiquidity(address(basePool), basePoolToken, [amount0, amount1, amount2, amount3], 0);
    }

    function addBasePoolLiquidity(uint256[] memory amounts)
        private
        returns (uint256)
    {
        if (basePoolCoinCount == 2)
        {
            return CheapSafeCurve.safeAddLiquidity(address(basePool), basePoolToken, [amounts[0], amounts[1]], 0);
        }
        if (basePoolCoinCount == 3)
        {
            return CheapSafeCurve.safeAddLiquidity(address(basePool), basePoolToken, [amounts[0], amounts[1], amounts[2]], 0);
        }
        return CheapSafeCurve.safeAddLiquidity(address(basePool), basePoolToken, [amounts[0], amounts[1], amounts[2], amounts[3]], 0);
    }

    function zap(IERC20 token, uint256 tokenAmount, bool mintREUSD)
        public
    {
        if (tokenAmount == 0) { revert ZeroAmount(); }

        if (mintREUSD && token != REUSD) 
        {
            /*
                Convert whatever the user is staking into REUSD, and
                then continue onwards as if the user is staking REUSD
            */
            tokenAmount = getREUSDAmount(token, tokenAmount);
            if (tokenAmount == 0) { revert ZeroAmount(); }
            mintREUSDCore(msg.sender, token, address(this), tokenAmount);
            token = REUSD;
        }
        else 
        {
            token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        }
        
        if (isBasePoolToken(token)) 
        {
            /*
                Add liquidity to the base pool, and then continue onwards
                as if the user is staking the base pool token
            */
            tokenAmount = addBasePoolLiquidity(token, tokenAmount);
            if (tokenAmount == 0) { revert ZeroAmount(); }
            token = address(poolCoin0) == address(REUSD) ? poolCoin1 : poolCoin0;
        }
        if (token == poolCoin0 || token == poolCoin1) 
        {
            /*
                Add liquidity to the pool, and then continue onwards as if
                the user is staking the pool token
            */
            tokenAmount = CheapSafeCurve.safeAddLiquidity(address(pool), pool, [
                token == poolCoin0 ? tokenAmount : 0,
                token == poolCoin1 ? tokenAmount : 0
                ], 0);
            if (tokenAmount == 0) { revert ZeroAmount(); }
            token = pool;
        }
        else if (token != pool) { revert UnsupportedToken(); }

        gauge.deposit(tokenAmount, msg.sender, true);

        blargitrage.balance();
    }

    function zapPermit(IERC20Full token, uint256 tokenAmount, bool mintREUSD, uint256 permitAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        public
    {
        token.permit(msg.sender, address(this), permitAmount, deadline, v, r, s);
        zap(token, tokenAmount, mintREUSD);
    }

    function getBalancedZapREUSDAmount(IERC20 token, uint256 tokenAmount) 
        public
        view
        returns (uint256 reusdAmount)
    {
        // Disregards slippage/imbalance on the base pool, which we assume to be well-funded
        // Assume REUSD = $1
        if (!isBasePoolToken(token)) { revert UnsupportedToken(); }
        uint256 maxREUSDAmount = getREUSDAmount(token, tokenAmount);
        if (maxREUSDAmount == 0) { revert ZeroAmount(); }

        uint256 reusdBalance = pool.balances(poolCoin0 == REUSD ? 0 : 1);
        uint256 baseDollars = pool.balances(poolCoin0 == REUSD ? 1 : 0) * basePool.get_virtual_price() / 1 ether;

        reusdAmount = baseDollars + maxREUSDAmount;
        if (reusdAmount <= reusdBalance) {
            reusdAmount = 0;
        }
        else {
            reusdAmount = (reusdAmount - reusdBalance) / 2;
            if (reusdAmount > maxREUSDAmount) { reusdAmount = maxREUSDAmount; }
        }
    }

    function balancedZap(IERC20 token, uint256 tokenAmount)
        public
    {
        uint256 reusdAmount = getBalancedZapREUSDAmount(token, tokenAmount);
        if (reusdAmount > 0) {      
            tokenAmount -= mintREUSDCore(msg.sender, token, address(this), reusdAmount);
        }
        if (tokenAmount > 0) {
            token.safeTransferFrom(msg.sender, address(this), tokenAmount);
            tokenAmount = addBasePoolLiquidity(token, tokenAmount);
            if (tokenAmount == 0) { revert ZeroAmount(); }
        }
        tokenAmount = CheapSafeCurve.safeAddLiquidity(address(pool), pool, [
            basePoolToken == poolCoin0 ? tokenAmount : reusdAmount,
            basePoolToken == poolCoin1 ? tokenAmount : reusdAmount
            ], 0);
        if (tokenAmount == 0) { revert ZeroAmount(); }

        gauge.deposit(tokenAmount, msg.sender, true);

        blargitrage.balance();
    }

    function balancedZapPermit(IERC20Full token, uint256 tokenAmount, uint256 permitAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        public
    {
        token.permit(msg.sender, address(this), permitAmount, deadline, v, r, s);
        balancedZap(token, tokenAmount);
    }

    function unzap(IERC20 desiredToken, uint256 gaugeAmount)
        public
    {
        unzapCore(desiredToken, gaugeAmount);
        blargitrage.balance();
    }

    function unzapPermit(IERC20 desiredToken, uint256 gaugeAmount, uint256 permitAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        public
    {
        gauge.permit(msg.sender, address(this), permitAmount, deadline, v, r, s);
        unzap(desiredToken, gaugeAmount);
    }

    function unzapCore(IERC20 desiredToken, uint256 amount)
        private
    {
        if (amount == 0) { revert ZeroAmount(); }       

        gauge.transferFrom(msg.sender, address(this), amount);
        gauge.claim_rewards(msg.sender);
        CheapSafeCurve.safeWithdraw(address(gauge), amount, false);

        /*
            Now, we have pool tokens (1 gauge token yields 1 pool token)
        */

        if (desiredToken == pool)
        {
            // If they want the pool token, just send it and we're done
            desiredToken.safeTransfer(msg.sender, amount);
            return;
        }
        if (desiredToken == poolCoin0 || desiredToken == poolCoin1)
        {
            // If they want either REUSD or the base pool token, then
            // remove liquidity to them directly and we're done
            CheapSafeCurve.safeRemoveLiquidityOneCoin(address(pool), desiredToken, desiredToken == poolCoin0 ? 0 : 1, amount, 1, msg.sender);
            return;
        }
        
        if (!isBasePoolToken(desiredToken)) { revert UnsupportedToken(); }

        // They want one of the base pool coins, so remove pool
        // liquidity to get base pool tokens, then remove base pool
        // liquidity directly to the them
        amount = CheapSafeCurve.safeRemoveLiquidityOneCoin(address(pool), basePoolToken, poolCoin0 == basePoolToken ? 0 : 1, amount, 1, address(this));
        
        CheapSafeCurve.safeRemoveLiquidityOneCoin(
            address(basePool), 
            desiredToken, 
            desiredToken == basePoolCoin0 ? 0 : desiredToken == basePoolCoin1 ? 1 : desiredToken == basePoolCoin2 ? 2 : 3,
            amount, 
            1, 
            msg.sender);
    }

    function balancedUnzap(uint256 gaugeAmount, uint256 gaugeAmountForREUSD, uint32[] calldata basePoolProportions)
        public
    {
        balancedUnzapCore(gaugeAmount, gaugeAmountForREUSD, basePoolProportions);
        blargitrage.balance();
    }

    function balancedUnzapCore(uint256 gaugeAmount, uint256 gaugeAmountForREUSD, uint32[] calldata basePoolProportions)
        private
    {
        if (gaugeAmount == 0) { revert ZeroAmount(); }
        if (gaugeAmountForREUSD > gaugeAmount) { revert UnbalancedProportions(); }
        if (basePoolProportions.length != basePoolCoinCount) { revert UnbalancedProportions(); }
        
        uint256 totalProportions = basePoolProportions[0];
        uint256 lastNonZeroProportionIndex = 0;
        for (uint256 x = 1; x < basePoolProportions.length; ++x)
        {
            if (basePoolProportions[x] > 0)
            {
                totalProportions += basePoolProportions[x];
                lastNonZeroProportionIndex = x;
            }
        }
        if (totalProportions == 0) { revert UnbalancedProportions(); }

        gauge.transferFrom(msg.sender, address(this), gaugeAmount);
        gauge.claim_rewards(msg.sender);
        CheapSafeCurve.safeWithdraw(address(gauge), gaugeAmount, false);

        /*
            Now, we have pool tokens (1 gauge token yields 1 pool token)
        */

        if (gaugeAmountForREUSD > 0)
        {
            // Remove REUSD and send it directly to the user
            CheapSafeCurve.safeRemoveLiquidityOneCoin(address(pool), REUSD, REUSD == poolCoin0 ? 0 : 1, gaugeAmountForREUSD, 1, msg.sender);
            gaugeAmount -= gaugeAmountForREUSD;
            if (gaugeAmount == 0) { return; }
        }

        // Remove base pool tokens
        gaugeAmount = CheapSafeCurve.safeRemoveLiquidityOneCoin(address(pool), basePoolToken, basePoolToken == poolCoin0 ? 0 : 1, gaugeAmount, 1, address(this));
        uint256 remainingAmount = gaugeAmount;

        for (uint256 x = 0; x < basePoolProportions.length; ++x)
        {
            uint256 amount = x >= lastNonZeroProportionIndex ? remainingAmount : ((gaugeAmount * basePoolProportions[x]) / totalProportions);
            if (amount > 0)
            {
                CheapSafeCurve.safeRemoveLiquidityOneCoin(
                    address(basePool), 
                    x == 0 ? basePoolCoin0 : x == 1 ? basePoolCoin1 : x == 2 ? basePoolCoin2 : basePoolCoin3,
                    x, 
                    amount, 
                    1, 
                    msg.sender);
                remainingAmount -= amount;
            }
        }
    }

    function balancedUnzapPermit(uint256 gaugeAmount, uint256 gaugeAmountForREUSD, uint32[] calldata basePoolProportions, uint256 permitAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        public
    {
        gauge.permit(msg.sender, address(this), permitAmount, deadline, v, r, s);
        balancedUnzap(gaugeAmount, gaugeAmountForREUSD, basePoolProportions);
    }

    function multiZap(TokenAmount[] calldata mints, TokenAmount[] calldata tokenAmounts)
        public
    {
        /*
            0-3 = basePoolCoin[0-3]
            4 = reusd
            5 = base pool token
            6 = pool token

            We'll loop through the parameters, adding whatever we find
            into the amounts[] array.

            Then we add base pool liquidity as required

            Then we add pool liquidity as required
        */
        uint256[] memory amounts = new uint256[](7);
        for (uint256 x = mints.length; x > 0;)
        {
            IERC20 token = mints[--x].token;
            uint256 amount = getREUSDAmount(token, mints[x].amount);
            mintREUSDCore(msg.sender, token, address(this), amount);
            amounts[4] += amount;
        }
        for (uint256 x = tokenAmounts.length; x > 0;)
        {
            IERC20 token = tokenAmounts[--x].token;
            uint256 amount = tokenAmounts[x].amount;
            if (token == basePoolCoin0)
            {
                amounts[0] += amount;
            }
            else if (token == basePoolCoin1)
            {
                amounts[1] += amount;
            }
            else if (token == basePoolCoin2)
            {
                amounts[2] += amount;
            }
            else if (token == basePoolCoin3)
            {
                amounts[3] += amount;
            }
            else if (token == REUSD)
            {
                amounts[4] += amount;
            }
            else if (token == basePoolToken)
            {
                amounts[5] += amount;
            }
            else if (token == pool)
            {
                amounts[6] += amount;
            }
            else 
            {
                revert UnsupportedToken();
            }
            token.safeTransferFrom(msg.sender, address(this), amount);
        }
        if (amounts[0] > 0 || amounts[1] > 0 || amounts[2] > 0 || amounts[3] > 0)
        {
            amounts[5] += addBasePoolLiquidity(amounts);
        }
        if (amounts[4] > 0 || amounts[5] > 0)
        {
            amounts[6] += CheapSafeCurve.safeAddLiquidity(address(pool), pool, poolCoin0 == REUSD ? [amounts[4], amounts[5]] : [amounts[5], amounts[4]], 0);            
        }
        if (amounts[6] == 0)
        {
            revert ZeroAmount();
        }

        gauge.deposit(amounts[6], msg.sender, true);

        blargitrage.balance();
    }

    function multiZapPermit(TokenAmount[] calldata mints, TokenAmount[] calldata tokenAmounts, PermitData[] calldata permits)
        public
    {
        for (uint256 x = permits.length; x > 0;)
        {
            --x;
            permits[x].token.permit(msg.sender, address(this), permits[x].permitAmount, permits[x].deadline, permits[x].v, permits[x].r, permits[x].s);
        }
        multiZap(mints, tokenAmounts);
    }

    function compound(ISelfStakingERC20 selfStakingToken)
        public
    {
        IERC20 rewardToken = selfStakingToken.rewardToken();
        uint256 rewardAmount = rewardToken.balanceOf(msg.sender);
        gauge.claim_rewards(msg.sender);
        selfStakingToken.claimFor(msg.sender);
        rewardAmount = rewardToken.balanceOf(msg.sender) - rewardAmount;
        if (rewardAmount == 0) { revert ZeroAmount(); }
        balancedZap(rewardToken, rewardAmount);
    }

    function compoundPermit(ISelfStakingERC20 selfStakingToken, uint256 permitAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        public
    {
        IERC20Full(address(selfStakingToken.rewardToken())).permit(msg.sender, address(this), permitAmount, deadline, v, r, s);
        compound(selfStakingToken);
    }
}