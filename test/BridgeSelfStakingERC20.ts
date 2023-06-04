import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestBridgeSelfStakingERC20 } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import getBridgeInSignature from "./helpers/getBridgeInSignature"
const { utils, constants } = ethers

describe("BridgeSelfStakingERC20", function () {
    let erc20: TestBridgeSelfStakingERC20
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let minter: SignerWithAddress
    let factories: ContractFactories
    let rewardToken: ERC20

    beforeEach(async function () {
        ; ([owner, user1, user2, user3, minter] = await ethers.getSigners());
        factories = createContractFactories(owner)
        rewardToken = await factories.ERC20.deploy()
        upgrades.silenceWarnings()
        erc20 = await upgrades.deployProxy(factories.BridgeSelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] }) as TestBridgeSelfStakingERC20
        await erc20.connect(user1).mint(utils.parseEther("100"))
        await erc20.connect(owner).setMinter(minter.address, true)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.BridgeSelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.BridgeSelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("init params as expected", async function () {
        expect(await erc20.name()).to.equal("Test Token")
        expect(await erc20.isBridgeable()).to.equal(true)
        expect(await erc20.bridgeInstructionFulfilled(0)).to.equal(false)
        expect(await erc20.isMinter(owner.address)).to.equal(false)
        expect(await erc20.isMinter(minter.address)).to.equal(true)
    })

    it("bridgeIn fails for zero amount", async function () {
        await expect(erc20.bridgeIn({ instructionId: 0, value: 0, to: owner.address, v: 0, r: "0x1234567812345678123456781234567812345678123456781234567812345678", s: "0x1234567812345678123456781234567812345678123456781234567812345678" })).to.be.revertedWithCustomError(erc20, "ZeroAmount")
    })
    it("bridgeIn fails when not signed by minter", async function () {
        await expect(erc20.bridgeIn({ instructionId: 0, value: 1, to: owner.address, v: 0, r: "0x1234567812345678123456781234567812345678123456781234567812345678", s: "0x1234567812345678123456781234567812345678123456781234567812345678" })).to.be.revertedWithCustomError(erc20, "InvalidBridgeSignature")
    })

    it("multiBridgeIn fails if no operations", async function () {
        await expect(erc20.multiBridgeIn([])).to.be.revertedWithCustomError(erc20, "ZeroArray")
    })

    it("multiBridgeIn fails if none valid", async function () {
        await expect(erc20.multiBridgeIn([{ instructionId: 0, value: 1, to: owner.address, v: 0, r: "0x1234567812345678123456781234567812345678123456781234567812345678", s: "0x1234567812345678123456781234567812345678123456781234567812345678" }])).to.be.revertedWithCustomError(erc20, "InvalidBridgeSignature")
    })

    it("bridgeOut works as expected", async function () {
        await expect(erc20.connect(user1).bridgeOut(user2.address, utils.parseEther("1"))).to.emit(erc20, "BridgeOut").withArgs(user1.address, user2.address, utils.parseEther("1"))
        expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("99"))
        expect(await erc20.totalSupply()).to.equal(utils.parseEther("99"))
    })

    it("bridgeOut fails for zero amount", async function () {
        await expect(erc20.connect(user1).bridgeOut(user2.address, 0)).to.be.revertedWithCustomError(erc20, "ZeroAmount")
    })

    it("bridgeOut fails for zero address", async function () {
        await expect(erc20.connect(user1).bridgeOut(constants.AddressZero, 1)).to.be.revertedWithCustomError(erc20, "ZeroAddress")
    })

    it("bridgeIn fails for valid signature but non minter", async function () {
        const { v, r, s } = await getBridgeInSignature(erc20, user1, 0, user2.address, 1234)
        await expect(erc20.connect(user2).bridgeIn({ instructionId: 0, value: 1234, to: user2.address, v, r, s })).to.be.revertedWithCustomError(erc20, "InvalidBridgeSignature")
    })

    describe("bridgeIn 1234 for user2", function () {
        beforeEach(async function () {
            const { v, r, s } = await getBridgeInSignature(erc20, minter, 0, user2.address, 1234)
            await erc20.connect(user2).bridgeIn({ instructionId: 0, value: 1234, to: user2.address, v, r, s })
        })

        it("worked as expected", async function () {
            expect(await erc20.balanceOf(user2.address)).to.equal(1234)
            expect(await erc20.bridgeInstructionFulfilled(0)).to.equal(true)
        })

        it("duplicate instruction doesn't work", async function () {
            const { v, r, s } = await getBridgeInSignature(erc20, minter, 0, user2.address, 12345)
            await expect(erc20.connect(user2).bridgeIn({ instructionId: 0, value: 12345, to: user2.address, v, r, s })).to.be.revertedWithCustomError(erc20, "DuplicateInstruction")
        })
    })

    describe("multiBridgeIn 1234 for user2 and 2345 for user3", function () {
        beforeEach(async function () {
            const { v, r, s } = await getBridgeInSignature(erc20, minter, 0, user2.address, 1234)
            const { v: v2, r: r2, s: s2 } = await getBridgeInSignature(erc20, minter, 1, user3.address, 2345)
            await erc20.connect(user2).multiBridgeIn([
                { instructionId: 0, value: 1234, to: user2.address, v, r, s },
                { instructionId: 1, value: 2345, to: user3.address, v: v2, r: r2, s: s2 }
            ])
        })

        it("worked as expected", async function () {
            expect(await erc20.balanceOf(user2.address)).to.equal(1234)
            expect(await erc20.bridgeInstructionFulfilled(0)).to.equal(true)
            expect(await erc20.balanceOf(user3.address)).to.equal(2345)
            expect(await erc20.bridgeInstructionFulfilled(1)).to.equal(true)
        })

        it("duplicate instruction doesn't work", async function () {
            const { v, r, s } = await getBridgeInSignature(erc20, minter, 0, user2.address, 12345)
            await expect(erc20.connect(user2).bridgeIn({ instructionId: 0, value: 12345, to: user2.address, v, r, s })).to.be.revertedWithCustomError(erc20, "DuplicateInstruction")
            await expect(erc20.connect(user2).bridgeIn({ instructionId: 2, value: 12345, to: user2.address, v, r, s })).to.be.revertedWithCustomError(erc20, "InvalidBridgeSignature")
        })
    })
})