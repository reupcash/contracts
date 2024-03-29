// SPDX-License-Identifier: reup.cash
pragma solidity ^0.8.19;

import "./Curve/ICurveGauge.sol";
import "./Base/ISelfStakingERC20.sol";
import "./Base/IUpgradeableBase.sol";

interface IREClaimer is IUpgradeableBase
{
    function isREClaimer() external view returns (bool);
    function claim(ICurveGauge  gauge, ISelfStakingERC20  token) external;
    function multiClaim(ICurveGauge[] memory gauges, ISelfStakingERC20[] memory tokens) external;
}