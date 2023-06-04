import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestRECurveBlargitrage, TestRECurveZapper, TestREStablecoins, TestREYIELD } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import { TestRECustodian } from "../typechain-types/contracts/Test/TestRECustodian"
import { TestREUSD } from "../typechain-types/contracts/Test/TestREUSD"
import { TestDummyStableswap } from "../typechain-types/contracts/Test/TestDummyStableswap"
import deployStablecoins from "./helpers/deployStablecoins"
import { TestDummyGauge } from "../typechain-types/contracts/Test/TestDummyGauge"
import getPermitSignature from "./helpers/getPermitSignature"
const { utils, constants } = ethers

describe("RECurveZapper", function () {
    let owner: SignerWithAddress
    let factories: ContractFactories
    let zapper: TestRECurveZapper
    let custodian: TestRECustodian
    let reusd: TestREUSD
    let pool: TestDummyStableswap
    let basePool: TestDummyStableswap
    let stablecoins: TestREStablecoins
    let USDC: ERC20
    let USDT: ERC20
    let DAI: ERC20
    let dummyGauge: TestDummyGauge
    let unknown: ERC20
    let blargitrage: TestRECurveBlargitrage
    let reyield: TestREYIELD

    beforeEach(async function () {
        ; ([owner] = await ethers.getSigners());
        ; ({ DAI, USDC, USDT } = await deployStablecoins(owner));
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        custodian = await factories.RECustodian.deploy()
        reusd = await factories.REUSD.deploy("Real Estate USD", "REUSD")
        basePool = await factories.DummyStableswap.deploy(USDC.address, USDT.address)
        pool = await factories.DummyStableswap.deploy(basePool.address, reusd.address)
        stablecoins = await factories.REStablecoins.deploy(USDC.address, USDT.address, DAI.address)
        dummyGauge = await factories.DummyGauge.deploy(pool.address)
        unknown = await factories.ERC20.deploy()
        blargitrage = await factories.RECurveBlargitrage.deploy(custodian.address, reusd.address, pool.address, basePool.address, USDC.address)
        zapper = await upgrades.deployProxy(factories.RECurveZapper, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [dummyGauge.address, stablecoins.address, blargitrage.address] }) as TestRECurveZapper
        reyield = await factories.REYIELD.deploy(USDC.address, "Real Estate Yields", "REYIELD")
        await reusd.setMinter(zapper.address, true)
        await USDC.connect(owner).approve(zapper.address, constants.MaxUint256)
        await USDT.connect(owner).approve(zapper.address, constants.MaxUint256)
        await reusd.connect(owner).approve(zapper.address, constants.MaxUint256)
        await pool.connect(owner).approve(zapper.address, constants.MaxUint256)
        await basePool.connect(owner).approve(zapper.address, constants.MaxUint256)
        await dummyGauge.connect(owner).approve(zapper.address, constants.MaxUint256)
        await reyield.connect(owner).setDelegatedClaimer(zapper.address, true)
        await blargitrage.setSkipBalance(true)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.RECurveZapper, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [dummyGauge.address, stablecoins.address, blargitrage.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.RECurveZapper, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [dummyGauge.address, stablecoins.address, blargitrage.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("initializes as expected", async function () {
        expect(await zapper.owner()).to.equal(owner.address)
        expect(await zapper.isRECurveZapper()).to.equal(true)
        expect(await zapper.pool()).to.equal(pool.address)
        expect(await zapper.basePool()).to.equal(basePool.address)
        expect(await zapper.basePoolToken()).to.equal(basePool.address)
        expect(await zapper.gauge()).to.equal(dummyGauge.address)
        expect(await zapper.basePoolCoinCount()).to.equal(2)
    })

    it("zap 0 throws", async function () {
        await expect(zapper.zap(USDC.address, 0, true)).to.be.revertedWithCustomError(zapper, "ZeroAmount")
    })

    it("unzap 0 throws", async function () {
        await expect(zapper.unzap(USDC.address, 0)).to.be.revertedWithCustomError(zapper, "ZeroAmount")
    })

    it("balancedZap 0 throws", async function () {
        await expect(zapper.balancedZap(USDC.address, 0)).to.be.revertedWithCustomError(zapper, "ZeroAmount")
    })

    it("multiZap([], []) throws", async function () {
        await expect(zapper.multiZap([], [])).to.be.revertedWithCustomError(zapper, "ZeroAmount")
    })

    it("multiZapPermit([], [], []) throws", async function () {
        await expect(zapper.multiZapPermit([], [], [])).to.be.revertedWithCustomError(zapper, "ZeroAmount")
    })

    it("zap unknown throws", async function() {
        await unknown.connect(owner).approve(zapper.address, constants.MaxUint256)
        await expect(zapper.zap(unknown.address, 123, true)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        await expect(zapper.zap(unknown.address, 123, false)).to.be.revertedWithCustomError(zapper, "UnsupportedToken")
    })

    it("balancedZap unknown token throws", async function () {
        await expect(zapper.balancedZap(unknown.address, 1)).to.be.revertedWithCustomError(zapper, "UnsupportedToken")
    })

    it("pool mismatch reverts", async function() {
        pool = await factories.DummyStableswap.deploy(basePool.address, reusd.address)
        blargitrage = await factories.RECurveBlargitrage.deploy(custodian.address, reusd.address, pool.address, basePool.address, USDC.address)
        await expect(factories.RECurveZapper.deploy(dummyGauge.address, stablecoins.address, blargitrage.address)).to.be.revertedWithCustomError(zapper, "PoolMismatch")
    })

    it("basePool with REUSD reverts", async function() {
        basePool = await factories.DummyStableswap.deploy(USDC.address, reusd.address)
        blargitrage = await factories.RECurveBlargitrage.deploy(custodian.address, reusd.address, pool.address, basePool.address, USDC.address)
        await expect(factories.RECurveZapper.deploy(dummyGauge.address, stablecoins.address, blargitrage.address)).to.be.revertedWithCustomError(zapper, "BasePoolWithREUSD")
    })

    describe("initialize", async function () {
        beforeEach(async function () {
            await zapper.initialize()
        })

        it("initializes as expected", async function () {
            expect(await basePool.allowance(zapper.address, pool.address)).to.equal(constants.MaxUint256)
            expect(await reusd.allowance(zapper.address, pool.address)).to.equal(constants.MaxUint256)
            expect(await USDC.allowance(zapper.address, basePool.address)).to.equal(constants.MaxUint256)
            expect(await USDT.allowance(zapper.address, basePool.address)).to.equal(constants.MaxUint256)
            expect(await pool.allowance(zapper.address, dummyGauge.address)).to.equal(constants.MaxUint256)
        })

        describe("zap prepared", function () {
            beforeEach(async function () {
                await pool.setNextAddLiquidityMintAmount(123)
                await basePool.setNextAddLiquidityMintAmount(234)
                await pool.setAddLiquidityTransfer(true)
                await basePool.setAddLiquidityTransfer(true)
            })
            
            it("balancedZap", async function() {
                await zapper.connect(owner).balancedZap(USDC.address, 10000)
                
                const reusdAmount = utils.parseUnits("5000", 12)
                expect(await reusd.balanceOf(pool.address)).to.equal(reusdAmount)
                expect(await pool.addLiquidityAmounts0()).to.equal(234)
                expect(await pool.addLiquidityAmounts1()).to.equal(reusdAmount)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await basePool.addLiquidityCalled()).to.equal(true)
                expect(await USDC.balanceOf(custodian.address)).to.equal(5000)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("zap(usdc, 10000, true)", async function () {
                await zapper.connect(owner).zap(USDC.address, 10000, true)
                
                const reusdAmount = utils.parseUnits("10000", 12)
                expect(await reusd.balanceOf(pool.address)).to.equal(reusdAmount)
                expect(await pool.addLiquidityAmounts0()).to.equal(0)
                expect(await pool.addLiquidityAmounts1()).to.equal(reusdAmount)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await basePool.addLiquidityCalled()).to.equal(false)
                expect(await USDC.balanceOf(custodian.address)).to.equal(10000)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("zap(usdc, 10000, false)", async function () {
                await zapper.connect(owner).zap(USDC.address, 10000, false)

                expect(await reusd.balanceOf(pool.address)).to.equal(0)
                expect(await USDC.balanceOf(basePool.address)).to.equal(10000)
                expect(await basePool.addLiquidityAmounts0()).to.equal(10000)
                expect(await basePool.addLiquidityAmounts1()).to.equal(0)
                expect(await basePool.addLiquidityMinAmount()).to.equal(0)
                expect(await pool.addLiquidityAmounts0()).to.equal(234)
                expect(await pool.addLiquidityAmounts1()).to.equal(0)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await USDC.balanceOf(custodian.address)).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("zap(usdt, 10000, false)", async function () {
                await zapper.connect(owner).zap(USDT.address, 10000, false)

                expect(await reusd.balanceOf(pool.address)).to.equal(0)
                expect(await USDT.balanceOf(basePool.address)).to.equal(10000)
                expect(await basePool.addLiquidityAmounts0()).to.equal(0)
                expect(await basePool.addLiquidityAmounts1()).to.equal(10000)
                expect(await basePool.addLiquidityMinAmount()).to.equal(0)
                expect(await pool.addLiquidityAmounts0()).to.equal(234)
                expect(await pool.addLiquidityAmounts1()).to.equal(0)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("zapPermit(usdc, 10000, false)", async function () {
                const { v, r, s } = await getPermitSignature(USDC, owner, zapper.address, constants.MaxUint256, 2e9)
                await zapper.connect(owner).zapPermit(USDC.address, 10000, false, constants.MaxUint256, 2e9, v, r, s)

                expect(await reusd.balanceOf(pool.address)).to.equal(0)
                expect(await USDC.balanceOf(basePool.address)).to.equal(10000)
                expect(await basePool.addLiquidityAmounts0()).to.equal(10000)
                expect(await basePool.addLiquidityAmounts1()).to.equal(0)
                expect(await basePool.addLiquidityMinAmount()).to.equal(0)
                expect(await pool.addLiquidityAmounts0()).to.equal(234)
                expect(await pool.addLiquidityAmounts1()).to.equal(0)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("compound(reyield) zero", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await basePool.setNextRemoveLiquidityOneCoinReceived(10000)

                await zapper.connect(owner).zap(USDC.address, 10000, false)
                await expect(zapper.connect(owner).compound(reyield.address)).to.be.revertedWithCustomError(zapper, "ZeroAmount")
            })

            it("unzap(usdc, 123)", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await basePool.setNextRemoveLiquidityOneCoinReceived(10000)

                await zapper.connect(owner).zap(USDC.address, 10000, false)
                await zapper.connect(owner).unzap(USDC.address, 123)

                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(234)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("unzap(pool, 123)", async function() {
                await zapper.connect(owner).zap(USDC.address, 10000, false)
                await zapper.connect(owner).unzap(pool.address, 123)

                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(0)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("unzap(reusd, 123)", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await zapper.connect(owner).zap(USDC.address, 10000, true)
                await zapper.connect(owner).unzap(reusd.address, 123)

                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("unzap(basePool, 123)", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await zapper.connect(owner).zap(USDC.address, 10000, false)
                await zapper.connect(owner).unzap(basePool.address, 123)

                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("balancedUnzap(100% reusd, [0,0]) fails", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await zapper.connect(owner).zap(USDC.address, 10000, true)
                await expect(zapper.connect(owner).balancedUnzap(123, 123, [0, 0])).to.be.revertedWithCustomError(zapper, "UnbalancedProportions")
            })

            it("balancedUnzap(100% reusd, [1,1])", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await zapper.connect(owner).zap(USDC.address, 10000, true)
                await zapper.connect(owner).balancedUnzap(123, 123, [1, 1])

                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("balancedUnzap(0% reusd, [1,0])", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await basePool.setNextRemoveLiquidityOneCoinReceived(10000)

                await zapper.connect(owner).zap(USDC.address, 10000, false)
                await zapper.connect(owner).balancedUnzap(123, 0, [1, 0])
                
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(234)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("balancedUnzap(0% reusd, [0,1])", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await basePool.setNextRemoveLiquidityOneCoinReceived(10000)

                await zapper.connect(owner).zap(USDT.address, 10000, false)
                await zapper.connect(owner).balancedUnzap(123, 0, [0, 1])
                
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(234)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("balancedUnzap(0% reusd, [0,1000000])", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await basePool.setNextRemoveLiquidityOneCoinReceived(10000)

                await zapper.connect(owner).zap(USDT.address, 10000, false)
                await zapper.connect(owner).balancedUnzap(123, 0, [0, 1000000])
                
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(123)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(234)
                expect(await blargitrage.balanceCallCount()).to.equal(2)
            })

            it("balancedUnzap(0% reusd, [1000000,1000000])", async function() {
                await pool.setNextRemoveLiquidityOneCoinReceived(234)
                await basePool.setNextRemoveLiquidityOneCoinReceived(5000)

                await zapper.connect(owner).zap(USDC.address, 6000, false)
                await zapper.connect(owner).zap(USDT.address, 6000, false)
                await zapper.connect(owner).balancedUnzap(246, 0, [1000000, 1000000])
                
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(0)
                expect(await dummyGauge.claimRewardsAddress()).to.equal(owner.address)
                expect(await pool.removeLiquidityOneCoinAmount()).to.equal(246)
                expect(await basePool.removeLiquidityOneCoinAmount()).to.equal(117)
                expect(await blargitrage.balanceCallCount()).to.equal(3)
            })

            it("multiZap([usdc, 10000], [])", async function() {
                await zapper.connect(owner).multiZap([{ token: USDC.address, amount: 10000 }], [])

                const reusdAmount = utils.parseUnits("10000", 12)
                expect(await reusd.balanceOf(pool.address)).to.equal(reusdAmount)
                expect(await pool.addLiquidityAmounts0()).to.equal(0)
                expect(await pool.addLiquidityAmounts1()).to.equal(reusdAmount)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await basePool.addLiquidityCalled()).to.equal(false)
                expect(await USDC.balanceOf(custodian.address)).to.equal(10000)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("multiZap([usdt, 10000], [])", async function() {
                await zapper.connect(owner).multiZap([{ token: USDT.address, amount: 10000 }], [])

                const reusdAmount = utils.parseUnits("10000", 12)
                expect(await reusd.balanceOf(pool.address)).to.equal(reusdAmount)
                expect(await pool.addLiquidityAmounts0()).to.equal(0)
                expect(await pool.addLiquidityAmounts1()).to.equal(reusdAmount)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await basePool.addLiquidityCalled()).to.equal(false)
                expect(await USDT.balanceOf(custodian.address)).to.equal(10000)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("multiZapPermit([usdc, 10000], [])", async function() {
                const { v, r, s } = await getPermitSignature(USDC, owner, zapper.address, constants.MaxUint256, 2e9)
                await zapper.connect(owner).multiZapPermit([{ token: USDC.address, amount: 10000 }], [], [{ token: USDC.address, deadline: 2e9, permitAmount: constants.MaxUint256, v, r, s }])

                const reusdAmount = utils.parseUnits("10000", 12)
                expect(await reusd.balanceOf(pool.address)).to.equal(reusdAmount)
                expect(await pool.addLiquidityAmounts0()).to.equal(0)
                expect(await pool.addLiquidityAmounts1()).to.equal(reusdAmount)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await basePool.addLiquidityCalled()).to.equal(false)
                expect(await USDC.balanceOf(custodian.address)).to.equal(10000)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("multiZap([], [usdc, 10000])", async function() {
                await zapper.connect(owner).multiZap([], [{ token: USDC.address, amount: 10000 }])

                expect(await reusd.balanceOf(pool.address)).to.equal(0)
                expect(await USDC.balanceOf(basePool.address)).to.equal(10000)
                expect(await basePool.addLiquidityAmounts0()).to.equal(10000)
                expect(await basePool.addLiquidityAmounts1()).to.equal(0)
                expect(await basePool.addLiquidityMinAmount()).to.equal(0)
                expect(await pool.addLiquidityAmounts0()).to.equal(234)
                expect(await pool.addLiquidityAmounts1()).to.equal(0)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await USDC.balanceOf(custodian.address)).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("multiZap([], [usdt, 10000])", async function() {
                await zapper.connect(owner).multiZap([], [{ token: USDT.address, amount: 10000 }])

                expect(await reusd.balanceOf(pool.address)).to.equal(0)
                expect(await USDT.balanceOf(basePool.address)).to.equal(10000)
                expect(await basePool.addLiquidityAmounts0()).to.equal(0)
                expect(await basePool.addLiquidityAmounts1()).to.equal(10000)
                expect(await basePool.addLiquidityMinAmount()).to.equal(0)
                expect(await pool.addLiquidityAmounts0()).to.equal(234)
                expect(await pool.addLiquidityAmounts1()).to.equal(0)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await USDT.balanceOf(custodian.address)).to.equal(0)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("multiZap([], [reusd, 10000])", async function() {
                await reusd.connect(owner).approve(zapper.address, constants.MaxUint256)
                await reusd.connect(owner).setMinter(owner.address, true)
                await reusd.connect(owner).mint(owner.address, 10000)
                await zapper.connect(owner).multiZap([], [{ token: reusd.address, amount: 10000 }])

                expect(await reusd.balanceOf(pool.address)).to.equal(10000)
                expect(await basePool.addLiquidityAmounts0()).to.equal(0)
                expect(await basePool.addLiquidityAmounts1()).to.equal(0)
                expect(await basePool.addLiquidityMinAmount()).to.equal(0)
                expect(await pool.addLiquidityAmounts0()).to.equal(0)
                expect(await pool.addLiquidityAmounts1()).to.equal(10000)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })

            it("multiZap([], [basePool, 10000])", async function() {
                await basePool.connect(owner).approve(zapper.address, constants.MaxUint256)
                await basePool.connect(owner).mint(owner.address, 10000)
                await zapper.connect(owner).multiZap([], [{ token: basePool.address, amount: 10000 }])

                expect(await pool.addLiquidityAmounts0()).to.equal(10000)
                expect(await pool.addLiquidityAmounts1()).to.equal(0)
                expect(await pool.addLiquidityMinAmount()).to.equal(0)
                expect(await dummyGauge.balanceOf(owner.address)).to.equal(123)
                expect(await blargitrage.balanceCallCount()).to.equal(1)
            })
        })
    })
})