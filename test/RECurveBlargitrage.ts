import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestRECurveBlargitrage } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import { TestRECustodian } from "../typechain-types/contracts/Test/TestRECustodian"
import { TestREUSD } from "../typechain-types/contracts/Test/TestREUSD"
import { TestDummyStableswap } from "../typechain-types/contracts/Test/TestDummyStableswap"
const { utils } = ethers

describe("RECurveBlargitrage", function () {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let factories: ContractFactories
    let blargitrage: TestRECurveBlargitrage
    let custodian: TestRECustodian
    let reusd: TestREUSD
    let desiredToken: ERC20
    let pool: TestDummyStableswap
    let basePool: TestDummyStableswap
    let otherPoolToken: ERC20
    let otherBasePoolToken: ERC20

    beforeEach(async function () {
        ; ([owner, user1] = await ethers.getSigners());
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        custodian = await factories.RECustodian.deploy()
        reusd = await factories.REUSD.deploy("Real Estate USD", "REUSD")
        desiredToken = await factories.ERC20.deploy()
        otherBasePoolToken = await factories.ERC20.deploy()
        otherPoolToken = await factories.ERC20.deploy()
        basePool = await factories.DummyStableswap.deploy(otherBasePoolToken.address, desiredToken.address)
        pool = await factories.DummyStableswap.deploy(otherPoolToken.address, reusd.address)
        blargitrage = await upgrades.deployProxy(factories.RECurveBlargitrage, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [custodian.address, reusd.address, pool.address, basePool.address, desiredToken.address] }) as TestRECurveBlargitrage
        otherBasePoolToken.transfer(basePool.address, utils.parseEther("10000000"))
        desiredToken.transfer(basePool.address, utils.parseEther("10000000"))
        otherPoolToken.transfer(pool.address, utils.parseEther("10000000"))
        reusd.mint(pool.address, utils.parseEther("10000000"))
        await reusd.setMinter(blargitrage.address, true)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.RECurveBlargitrage, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [custodian.address, reusd.address, pool.address, basePool.address, desiredToken.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.RECurveBlargitrage, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [custodian.address, reusd.address, pool.address, basePool.address, desiredToken.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("initializes as expected", async function () {
        expect(await blargitrage.owner()).to.equal(owner.address)
        expect(await blargitrage.isRECurveBlargitrage()).to.equal(true)
        expect(await blargitrage.pool()).to.equal(pool.address)
        expect(await blargitrage.basePool()).to.equal(basePool.address)
        expect(await blargitrage.desiredToken()).to.equal(desiredToken.address)
        expect(await blargitrage.totalAmount()).to.equal(0)
        expect(await blargitrage.getBasePoolIndex()).to.equal(0)
        expect(await blargitrage.getREUSDIndex()).to.equal(1)
        expect(await blargitrage.getBasePoolToken()).to.equal(otherPoolToken.address)
        expect(await blargitrage.REUSD()).to.equal(reusd.address)
        expect(await blargitrage.custodian()).to.equal(custodian.address)
    })

    it("dies if desired token isn't in base pool", async function () {
        await expect(factories.RECurveBlargitrage.deploy(custodian.address, reusd.address, pool.address, pool.address, desiredToken.address)).to.be.reverted
    })

    it("works if reusd in other index", async function () {
        pool = await factories.DummyStableswap.deploy(reusd.address, otherPoolToken.address)
        blargitrage = await factories.RECurveBlargitrage.deploy(custodian.address, reusd.address, pool.address, basePool.address, desiredToken.address)
        expect(await blargitrage.getBasePoolIndex()).to.equal(1)
        expect(await blargitrage.getREUSDIndex()).to.equal(0)
    })

    it("works if desired token in other index", async function () {
        basePool = await factories.DummyStableswap.deploy(desiredToken.address, otherBasePoolToken.address)
        await upgrades.deployProxy(factories.RECurveBlargitrage, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [custodian.address, reusd.address, pool.address, basePool.address, desiredToken.address] }) as TestRECurveBlargitrage
    })

    it("does nothing when balanced", async function () {
        await pool.setBalance(0, utils.parseEther("1000000"))
        await pool.setBalance(1, utils.parseEther("1000000"))
        await basePool.setVirtualPrice(utils.parseEther("1"))
        await blargitrage.balance()
        expect(await pool.addLiquidityAmounts0()).to.equal(0)
        expect(await pool.addLiquidityAmounts1()).to.equal(0)
        expect(await pool.addLiquidityCalled()).to.equal(false)
    })

    it("does nothing when off balance by less than threshold", async function () {
        await pool.setBalance(0, utils.parseEther("1000000"))
        await pool.setBalance(1, utils.parseEther("999001"))
        await basePool.setVirtualPrice(utils.parseEther("1"))
        await blargitrage.balance()
        expect(await pool.addLiquidityAmounts0()).to.equal(0)
        expect(await pool.addLiquidityAmounts1()).to.equal(0)
        expect(await pool.addLiquidityCalled()).to.equal(false)
    })

    it("does nothing when off balance by less than threshold in wrong direction", async function () {
        await pool.setBalance(0, utils.parseEther("800000"))
        await pool.setBalance(1, utils.parseEther("1000000"))
        await basePool.setVirtualPrice(utils.parseEther("1"))
        await blargitrage.balance()
        expect(await pool.addLiquidityAmounts0()).to.equal(0)
        expect(await pool.addLiquidityAmounts1()).to.equal(0)
        expect(await pool.addLiquidityCalled()).to.equal(false)
    })

    it("balances when off balance", async function () {
        await basePool.setSkipLiquidityBurn(true)
        await pool.setBalance(0, utils.parseEther("1000000"))
        await pool.setBalance(1, utils.parseEther("999000"))
        await basePool.setVirtualPrice(utils.parseEther("1"))
        await pool.setNextAddLiquidityMintAmount(12345)
        await basePool.setNextRemoveLiquidityOneCoinReceived(987)
        await blargitrage.balance()
        expect(await pool.addLiquidityAmounts0()).to.equal(0)
        expect(await pool.addLiquidityAmounts1()).to.equal(utils.parseEther("1000"))
        expect(await pool.addLiquidityCalled()).to.equal(true)
        expect(await pool.removeLiquidityAmount()).to.equal(12345)
        expect(await pool.removeLiquidityMinAmounts0()).to.equal(0)
        expect(await pool.removeLiquidityMinAmounts1()).to.equal(0)
        expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(123)
        expect(await basePool.removeLiquidityOneCoinMinReceived()).to.equal(0)
        expect(await blargitrage.totalAmount()).to.equal(987)
        expect(await desiredToken.balanceOf(custodian.address)).to.equal(987)
    })
})