// SPDX-License-Identifier: reup.cash
pragma solidity ^0.8.19;

import "../Base/Minter.sol";
import "../Base/Owned.sol";

contract TestMinter is Minter, Owned
{
    function test()
        public
        onlyMinter
    {}

    function getMinterOwner() internal override view returns (address) { return owner(); }
}