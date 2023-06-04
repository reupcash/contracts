import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestBridgeRERC20, TestDummyGauge, TestDummyStableswap, TestREBacking, TestREBlank, TestREClaimer, TestRECurveBlargitrage, TestRECurveMintedRewards, TestRECurveZapper, TestRECustodian, TestREStablecoins, TestREUP, TestREUSD, TestREUSDExit, TestREUSDMinter, TestREWardSplitter, TestREYIELD } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import getBridgeInSignature from "./helpers/getBridgeInSignature"
import deployStablecoins from "./helpers/deployStablecoins"
const { utils, constants } = ethers

describe("REBlank", function() {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let factories: ContractFactories
    let custodian: TestRECustodian
    let stablecoins: TestREStablecoins
    let claimer: TestREClaimer
    let blank: TestREBlank
    let reup: TestREUP
    let reusd: TestREUSD
    let reusdexit: TestREUSDExit
    let reusdminter: TestREUSDMinter
    let reyield: TestREYIELD
    let backing: TestREBacking
    let splitter: TestREWardSplitter
    let curveMintedRewards: TestRECurveMintedRewards

    let zapper: TestRECurveZapper    
    let blargitrage: TestRECurveBlargitrage
        
    let USDC: ERC20
    let USDT: ERC20
    let DAI: ERC20
    
    let dummyBasePool: TestDummyStableswap
    let dummyStableswap: TestDummyStableswap
    let dummyGauge: TestDummyGauge

    beforeEach(async function() {
        ; ([owner, user1] = await ethers.getSigners());
        ; ({ DAI, USDC, USDT } = await deployStablecoins(owner));
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()        
        blank = await factories.REBlank.deploy()
        custodian = await upgrades.deployProxy(factories.RECustodian, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestRECustodian        
        claimer = await upgrades.deployProxy(factories.REClaimer, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestREClaimer
        stablecoins = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, USDT.address, DAI.address] }) as TestREStablecoins
        reup = await upgrades.deployProxy(factories.REUP, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate Rewards", "REUP"] }) as TestREUP
        reusd = await upgrades.deployProxy(factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] }) as TestREUSD
        reusdexit = await upgrades.deployProxy(factories.REUSDExit, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [reusd.address, stablecoins.address] }) as TestREUSDExit
        reusdminter = await upgrades.deployProxy(factories.REUSDMinter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [custodian.address, reusd.address, stablecoins.address] }) as TestREUSDMinter
        reyield = await upgrades.deployProxy(factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, "Real Estate Yield", "REYIELD"] }) as TestREYIELD
        backing = await upgrades.deployProxy(factories.REBacking, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestREBacking
        splitter = await upgrades.deployProxy(factories.REWardSplitter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] }) as TestREWardSplitter

        dummyBasePool = await factories.DummyStableswap.deploy(USDC.address, USDT.address)
        dummyStableswap = await factories.DummyStableswap.deploy(dummyBasePool.address, reusd.address)
        dummyGauge = await factories.DummyGauge.deploy(dummyStableswap.address)

        curveMintedRewards = await upgrades.deployProxy(factories.RECurveMintedRewards, [], { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [reyield.address, dummyGauge.address] }) as TestRECurveMintedRewards        
        blargitrage = await upgrades.deployProxy(factories.RECurveBlargitrage, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [custodian.address, reusd.address, dummyStableswap.address, dummyBasePool.address, USDC.address] }) as TestRECurveBlargitrage
        zapper = await upgrades.deployProxy(factories.RECurveZapper, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [dummyGauge.address, stablecoins.address, blargitrage.address] }) as TestRECurveZapper
    })

    it("custodian", async function() {
        await custodian.setContractVersion(2e9)
        await custodian.upgradeTo(blank.address)
    })

    it("claimer", async function() {
        await claimer.setContractVersion(2e9)
        await claimer.upgradeTo(blank.address)
    })

    it("stablecoins", async function() {
        await stablecoins.setContractVersion(2e9)
        await stablecoins.upgradeTo(blank.address)
    })

    it("reup", async function() {
        await reup.setContractVersion(2e9)
        await reup.upgradeTo(blank.address)
    })

    it("reusd", async function() {
        await reusd.setContractVersion(2e9)
        await reusd.upgradeTo(blank.address)
    })

    it("reusdexit", async function() {
        await reusd.setContractVersion(2e9)
        await reusd.upgradeTo(blank.address)
    })

    it("reusdminter", async function() {
        await reusdminter.setContractVersion(2e9)
        await reusdminter.upgradeTo(blank.address)
    })

    it("reyield", async function() {
        await reyield.setContractVersion(2e9)
        await reyield.upgradeTo(blank.address)
    })

    it("backing", async function() {
        await backing.setContractVersion(2e9)
        await backing.upgradeTo(blank.address)
    })

    it("curveMintedRewards", async function() {
        await curveMintedRewards.setContractVersion(2e9)
        await curveMintedRewards.upgradeTo(blank.address)
    })

    it("splitter", async function() {
        await splitter.setContractVersion(2e9)
        await splitter.upgradeTo(blank.address)
    })

    it("blargitrage", async function() {
        await blargitrage.setContractVersion(2e9)
        await blargitrage.upgradeTo(blank.address)
    })

    it("zapper", async function() {
        await zapper.setContractVersion(2e9)
        await zapper.upgradeTo(blank.address)
    })

})