import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import * as t from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import deployStablecoins from "./helpers/deployStablecoins"
import getPermitSignature from "./helpers/getPermitSignature"
const { utils, constants } = ethers

describe("REUSDMinter", function () {
    let factories: ContractFactories
    let REUSD: t.TestREUSD
    let REUSDMinter: t.TestREUSDMinter
    let DAI: t.ERC20
    let USDC: t.ERC20
    let USDT: t.ERC20
    let Stablecoins: t.TestREStablecoins
    let RECustodian: t.TestRECustodian
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        ; ({ DAI, USDC, USDT } = await deployStablecoins(owner));
        factories = await createContractFactories(owner)
        upgrades.silenceWarnings()
        REUSD = await upgrades.deployProxy(factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] }) as t.TestREUSD
        Stablecoins = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, USDT.address, DAI.address] }) as t.TestREStablecoins
        RECustodian = await upgrades.deployProxy(factories.RECustodian, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] }) as t.TestRECustodian
        REUSDMinter = await upgrades.deployProxy(factories.REUSDMinter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [RECustodian.address, REUSD.address, Stablecoins.address] }) as t.TestREUSDMinter
        await USDC.connect(owner).approve(REUSDMinter.address, constants.MaxUint256)
        await USDT.connect(owner).approve(REUSDMinter.address, constants.MaxUint256)
        await DAI.connect(owner).approve(REUSDMinter.address, constants.MaxUint256)
        await REUSD.connect(owner).setMinter(REUSDMinter.address, true)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REUSDMinter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [RECustodian.address, REUSD.address, Stablecoins.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REUSDMinter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [RECustodian.address, REUSD.address, Stablecoins.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REUSDMinter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [RECustodian.address, REUSD.address, Stablecoins.address] })
        await expect(upgrades.upgradeProxy(c, factories.REUSDMinter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [RECustodian.address, REUSD.address, Stablecoins.address] })).to.be.revertedWithCustomError(Stablecoins, "UpgradeToSameVersion")
    })

    it("initializes as expected", async function () {
        expect(await REUSDMinter.isREUSDMinter());
        expect(await REUSDMinter.totalMinted()).to.equal(0)
        expect(await REUSDMinter.totalReceived(USDC.address)).to.equal(0)
    })

    it("getREUSDAmount", async function () {
        expect(await REUSDMinter.getREUSDAmount(USDC.address, 0)).to.equal(0)
        expect(await REUSDMinter.getREUSDAmount(USDT.address, 0)).to.equal(0)
        expect(await REUSDMinter.getREUSDAmount(DAI.address, 0)).to.equal(0)
        expect(await REUSDMinter.getREUSDAmount(USDC.address, 1)).to.equal(utils.parseUnits("1", 12))
        expect(await REUSDMinter.getREUSDAmount(USDT.address, 1)).to.equal(utils.parseUnits("1", 12))
        expect(await REUSDMinter.getREUSDAmount(DAI.address, 1)).to.equal(1)
        await expect(REUSDMinter.getREUSDAmount(user1.address, 0)).to.be.revertedWithCustomError(Stablecoins, "TokenNotSupported")
    })

    it("mint fails for unsupported token", async function () {
        await expect(REUSDMinter.connect(owner).mint(user1.address, utils.parseEther("0.0001"))).to.be.revertedWithCustomError(Stablecoins, "TokenNotSupported")
        await expect(REUSDMinter.connect(owner).mint(constants.AddressZero, utils.parseEther("0.0001"))).to.be.revertedWithCustomError(Stablecoins, "TokenNotSupported")
        await expect(REUSDMinter.connect(owner).mintTo(user1.address, user1.address, utils.parseEther("0.0001"))).to.be.revertedWithCustomError(Stablecoins, "TokenNotSupported")
        await expect(REUSDMinter.connect(owner).mintTo(constants.AddressZero, user1.address, utils.parseEther("0.0001"))).to.be.revertedWithCustomError(Stablecoins, "TokenNotSupported")
    })

    it("mint with $1 USDT yields 1 REUSD", async function () {
        await REUSDMinter.connect(owner).mint(USDT.address, utils.parseEther("1"))
        expect(await USDT.balanceOf(RECustodian.address)).to.equal(utils.parseUnits("1", 6))
        expect(await REUSD.balanceOf(owner.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.totalSupply()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalMinted()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalReceived(USDT.address)).to.equal(utils.parseUnits("1", 6))
        expect(await REUSDMinter.totalReceived(USDC.address)).to.equal(0)
    })

    it("mint with $1 USDC yields 1 REUSD", async function () {
        await REUSDMinter.connect(owner).mint(USDC.address, utils.parseEther("1"))
        expect(await USDC.balanceOf(RECustodian.address)).to.equal(utils.parseUnits("1", 6))
        expect(await REUSD.balanceOf(owner.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.totalSupply()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalMinted()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalReceived(USDC.address)).to.equal(utils.parseUnits("1", 6))
    })

    it("mintPermit with $1 USDC permit yields 1 REUSD", async function () {
        const { v, r, s } = await getPermitSignature(USDC, owner, REUSDMinter.address, utils.parseEther("1"), 2e9)
        await REUSDMinter.connect(owner).mintPermit(USDC.address, utils.parseEther("1"), utils.parseEther("1"), 2e9, v, r, s)
        expect(await USDC.balanceOf(RECustodian.address)).to.equal(utils.parseUnits("1", 6))
        expect(await REUSD.balanceOf(owner.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.totalSupply()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalMinted()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalReceived(USDC.address)).to.equal(utils.parseUnits("1", 6))
    })

    it("mint with $1 DAI yields 1 REUSD", async function () {
        await REUSDMinter.connect(owner).mint(DAI.address, utils.parseEther("1"))
        expect(await DAI.balanceOf(RECustodian.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.balanceOf(owner.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.totalSupply()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalMinted()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalReceived(DAI.address)).to.equal(utils.parseUnits("1", 18))
    })

    it("mintPermit with $1 DAI permit yields 1 REUSD", async function () {
        const { v, r, s } = await getPermitSignature(DAI, owner, REUSDMinter.address, utils.parseEther("1"), 2e9)
        await REUSDMinter.connect(owner).mintPermit(DAI.address, utils.parseEther("1"), utils.parseEther("1"), 2e9, v, r, s)
        expect(await DAI.balanceOf(RECustodian.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.balanceOf(owner.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.totalSupply()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalMinted()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalReceived(DAI.address)).to.equal(utils.parseUnits("1", 18))
    })

    it("mintTo with $1 USDT yields 1 REUSD", async function () {
        await REUSDMinter.connect(owner).mintTo(USDT.address, user1.address, utils.parseEther("1"))
        expect(await USDT.balanceOf(RECustodian.address)).to.equal(utils.parseUnits("1", 6))
        expect(await REUSD.balanceOf(owner.address)).to.equal(0)
        expect(await REUSD.balanceOf(user1.address)).to.equal(utils.parseEther("1"))
        expect(await REUSD.totalSupply()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalMinted()).to.equal(utils.parseEther("1"))
        expect(await REUSDMinter.totalReceived(USDT.address)).to.equal(utils.parseUnits("1", 6))
    })
})