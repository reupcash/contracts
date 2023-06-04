import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestRERC20 } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import getPermitSignature from "./helpers/getPermitSignature"
const { utils, constants } = ethers

describe("RERC20", function () {
    let erc20: TestRERC20
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let factories: ContractFactories

    beforeEach(async function () {
        ; ([user1, user2] = await ethers.getSigners());
        factories = createContractFactories(user1)
        upgrades.silenceWarnings()
        erc20 = await upgrades.deployProxy(factories.RERC20, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestRERC20
        await erc20.connect(user1).mint(utils.parseEther("100"))
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.RERC20, { unsafeAllow: ["delegatecall"], kind: "uups" })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.RERC20, { unsafeAllow: ["delegatecall"], kind: "uups" })
        expect(c.address).to.equal(c2.address)
    })

    it("init params as expected", async function () {
        expect(await erc20.name()).to.equal("Test Token")
        expect(await erc20.symbol()).to.equal("TST")
        expect(await erc20.decimals()).to.equal(18)
        expect(await erc20.isRERC20()).to.equal(true)
        expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
        expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("100"))
        expect(await erc20.balanceOf(user2.address)).to.equal(0)
        expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
        expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        expect(await erc20.version()).to.equal("1")
    })

    it("transferFrom zero address fails", async function() {
        await expect(erc20.transferFrom(constants.AddressZero, user2.address, 0)).to.be.revertedWithCustomError(erc20, "TransferFromZeroAddress")
    })

    it("mint to zero address fails", async function() {
        await expect(erc20.mintDirect(constants.AddressZero, 1)).to.be.revertedWithCustomError(erc20, "MintToZeroAddress")
    })

    it("burn too much fails", async function() {
        await expect(erc20.burnDirect(constants.AddressZero, 1)).to.be.revertedWithCustomError(erc20, "InsufficientBalance")
    })

    describe("transfer", function () {
        it("fails with insufficient balance", async function () {
            await expect(erc20.connect(user1).transfer(user2.address, utils.parseEther("1000000001"))).to.be.revertedWithCustomError(erc20, "InsufficientBalance")
        })

        it("works as expected", async function () {
            await erc20.connect(user1).transfer(user2.address, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user2.address)).to.equal(utils.parseEther("5"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        })

        it("to address(0) burns", async function () {
            await erc20.connect(user1).transfer(constants.AddressZero, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(constants.AddressZero)).to.equal(0)
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        })
    })

    it("approve works as expected", async function () {
        await erc20.connect(user1).approve(user2.address, utils.parseEther("5000"))

        expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("100"))
        expect(await erc20.balanceOf(user2.address)).to.equal(0)
        expect(await erc20.allowance(user1.address, user2.address)).to.equal(utils.parseEther("5000"))
        expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
    })

    describe("transferFrom", function () {
        it("Fails with insufficient approval", async function () {
            await expect(erc20.transferFrom(user1.address, user2.address, 1)).to.be.revertedWithCustomError(erc20, "InsufficientAllowance")
        })

        it("works as expected", async function () {
            await erc20.connect(user1).approve(user2.address, utils.parseEther("5"))
            await erc20.connect(user2).transferFrom(user1.address, user2.address, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user2.address)).to.equal(utils.parseEther("5"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        })

        it("doesn't adjust allowance if allowance is max", async function () {
            await erc20.connect(user1).approve(user2.address, constants.MaxUint256)
            await erc20.connect(user2).transferFrom(user1.address, user2.address, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user2.address)).to.equal(utils.parseEther("5"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(constants.MaxUint256)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        })

        it("to address(0) burns", async function () {
            await erc20.connect(user1).approve(user2.address, utils.parseEther("5"))
            await erc20.connect(user2).transferFrom(user1.address, constants.AddressZero, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(constants.AddressZero)).to.equal(utils.parseEther("0"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        })
    })

    describe("permit", function () {
        it("works as expected", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v, r, s)

            expect(await erc20.allowance(user1.address, user2.address)).to.equal(1234)
            expect(await erc20.nonces(user1.address)).to.equal(1)
            expect(await erc20.nonces(user2.address)).to.equal(0)
        })

        it("fails if nonce is reused", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v, r, s)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if deadline is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9 + 1, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if amount is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1235, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if spender is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user1.address, 1234, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if owner is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user2.address, user2.address, 1234, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if v is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v + 1, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v - 1, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if deadline has expired", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 1)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 1, v, r, s)).to.be.revertedWithCustomError(erc20, "DeadlineExpired")
        })
    })
})