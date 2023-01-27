import { ethers } from "hardhat"

async function lastBlockTimestamp(): Promise<number> {
    const blockNumber = await ethers.provider.getBlockNumber()
    const block = await ethers.provider.getBlock(blockNumber)
    return block.timestamp;
}

async function nextBlockTimestamp(timestamp?: number): Promise<number> {
    timestamp ??= await lastBlockTimestamp() + 1
    await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
    return timestamp
}

async function setBlockTimestamp(timestamp: number): Promise<number> {
    await ethers.provider.send("evm_mine", [timestamp])
    return timestamp
}

export {
    lastBlockTimestamp,
    nextBlockTimestamp,
    setBlockTimestamp
}