// SPDX-License-Identifier: reup.cash
pragma solidity ^0.8.19;

import "../Base/Owned.sol";

contract TestOwned is Owned
{
    function test()
        public
        onlyOwner
    {}
}