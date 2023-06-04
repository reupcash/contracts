import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestRECustodian } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import deployStablecoins from "./helpers/deployStablecoins"
const { constants } = ethers

describe("RECustodian", function () {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let factories: ContractFactories
    let custodian: TestRECustodian
    let USDC: ERC20
    let USDT: ERC20
    let DAI: ERC20

    beforeEach(async function () {
        ; ([owner, user1] = await ethers.getSigners());
        ; ({ DAI, USDC, USDT } = await deployStablecoins(owner));
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        custodian = await upgrades.deployProxy(factories.RECustodian, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestRECustodian
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.RECustodian, { unsafeAllow: ["delegatecall"], kind: "uups" })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.RECustodian, { unsafeAllow: ["delegatecall"], kind: "uups" })
        expect(c.address).to.equal(c2.address)
    })

    it("initializes as expected", async function () {
        expect(await custodian.owner()).to.equal(owner.address)
        expect(await custodian.isRECustodian()).to.equal(true)
        expect(await custodian.amountRecovered(constants.AddressZero)).to.equal(0)
        expect(await custodian.amountRecovered(USDC.address)).to.equal(0)
        expect(await custodian.amountRecovered(USDT.address)).to.equal(0)
        expect(await custodian.amountRecovered(DAI.address)).to.equal(0)
    })

    it("owner functions fail for non-owner", async function () {
        await expect(custodian.connect(user1).recoverERC20(USDC.address)).to.be.revertedWithCustomError(custodian, "NotRECoverableOwner")
        await expect(custodian.connect(user1).recoverNative()).to.be.revertedWithCustomError(custodian, "NotRECoverableOwner")
    })

    it("recover does nothing for owner", async function () {
        await custodian.connect(owner).recoverERC20(USDC.address)
        await custodian.connect(owner).recoverNative()
        expect(await custodian.amountRecovered(constants.AddressZero)).to.equal(0)
        expect(await custodian.amountRecovered(USDC.address)).to.equal(0)
    })

    describe("funded", function () {
        beforeEach(async function () {
            await owner.sendTransaction({ to: custodian.address, value: 123 })
            await USDC.connect(owner).transfer(custodian.address, 1234)
            await USDT.connect(owner).transfer(custodian.address, 12345)
            await DAI.connect(owner).transfer(custodian.address, 123456)
        })

        it("initializes as expected", async function () {
            expect(await custodian.amountRecovered(constants.AddressZero)).to.equal(0)
            expect(await custodian.amountRecovered(USDC.address)).to.equal(0)
            expect(await custodian.amountRecovered(USDT.address)).to.equal(0)
            expect(await custodian.amountRecovered(DAI.address)).to.equal(0)
        })

        it("owner functions fail for non-owner", async function () {
            await expect(custodian.connect(user1).recoverERC20(USDC.address)).to.be.revertedWithCustomError(custodian, "NotRECoverableOwner")
            await expect(custodian.connect(user1).recoverERC20(USDT.address)).to.be.revertedWithCustomError(custodian, "NotRECoverableOwner")
            await expect(custodian.connect(user1).recoverERC20(DAI.address)).to.be.revertedWithCustomError(custodian, "NotRECoverableOwner")
            await expect(custodian.connect(user1).recoverNative()).to.be.revertedWithCustomError(custodian, "NotRECoverableOwner")
        })

        it("recoverNative works", async function () {
            await custodian.connect(owner).recoverNative()
            expect(await custodian.amountRecovered(constants.AddressZero)).to.equal(123)
        })

        it("recoverERC20 works", async function () {
            await custodian.connect(owner).recoverERC20(USDC.address)
            await custodian.connect(owner).recoverERC20(USDT.address)
            await custodian.connect(owner).recoverERC20(DAI.address)
            expect(await custodian.amountRecovered(constants.AddressZero)).to.equal(0)
            expect(await custodian.amountRecovered(USDC.address)).to.equal(1234)
            expect(await custodian.amountRecovered(USDT.address)).to.equal(12345)
            expect(await custodian.amountRecovered(DAI.address)).to.equal(123456)
        })
    })
})