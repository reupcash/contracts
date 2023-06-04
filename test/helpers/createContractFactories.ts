import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { TestRECurveZapper__factory, TestGrumpyERC20__factory, TestRECurveBlargitrage__factory, TestREClaimer__factory, TestCheapSafeERC20__factory, TestUUPSUpgradeableVersion__factory, TestERC20__factory, TestREUSD__factory, TestMinter__factory, TestOwned__factory, TestRECoverable__factory, TestRECurveMintedRewards__factory, TestRECustodian__factory, TestREStablecoins__factory, TestREUP__factory, TestREUSDMinter__factory, TestREWardSplitter__factory, TestREYIELD__factory, TestStringHelper__factory, TestRERC20__factory, RERC20__factory, TestUUPSUpgradeable__factory, TestDummyStableswap__factory, TestDummyGauge__factory, TestSelfStakingERC20__factory, TestBridgeRERC20__factory, TestBridgeSelfStakingERC20__factory, TestREBacking__factory, TestREUSDExit__factory, TestREBlank__factory } from "../../typechain-types"

export type ContractFactories = {
    REYIELD: TestREYIELD__factory
    REUSD: TestREUSD__factory
    REUP: TestREUP__factory
    REUSDMinter: TestREUSDMinter__factory
    REStablecoins: TestREStablecoins__factory
    RECurveMintedRewards: TestRECurveMintedRewards__factory
    ERC20: TestERC20__factory
    REWardSplitter: TestREWardSplitter__factory
    RECustodian: TestRECustodian__factory
    Owned: TestOwned__factory
    Minter: TestMinter__factory
    RECoverable: TestRECoverable__factory
    StringHelper: TestStringHelper__factory
    RERC20: TestRERC20__factory
    UUPSUpgradeable: TestUUPSUpgradeable__factory
    DummyStableswap: TestDummyStableswap__factory
    DummyGauge: TestDummyGauge__factory
    SelfStakingERC20: TestSelfStakingERC20__factory
    BridgeRERC20: TestBridgeRERC20__factory
    BridgeSelfStakingERC20: TestBridgeSelfStakingERC20__factory
    REBacking: TestREBacking__factory
    CheapSafeERC20: TestCheapSafeERC20__factory
    UUPSUpgradeableVersion: TestUUPSUpgradeableVersion__factory
    REClaimer: TestREClaimer__factory
    RECurveBlargitrage: TestRECurveBlargitrage__factory
    RECurveZapper: TestRECurveZapper__factory
    GrumpyERC20: TestGrumpyERC20__factory
    REUSDExit: TestREUSDExit__factory
    REBlank: TestREBlank__factory
}

let lastOwner: SignerWithAddress
let lastFactories: ContractFactories

export default function createContractFactories(owner: SignerWithAddress): ContractFactories {
    if (lastFactories && owner.address === lastOwner?.address) { return lastFactories }
    lastOwner = owner
    lastFactories = {
        REYIELD: new TestREYIELD__factory(owner),
        REUSD: new TestREUSD__factory(owner),
        REUP: new TestREUP__factory(owner),
        REUSDMinter: new TestREUSDMinter__factory(owner),
        REStablecoins: new TestREStablecoins__factory(owner),
        RECurveMintedRewards: new TestRECurveMintedRewards__factory(owner),
        ERC20: new TestERC20__factory(owner),
        REWardSplitter: new TestREWardSplitter__factory(owner),
        RECustodian: new TestRECustodian__factory(owner),
        Owned: new TestOwned__factory(owner),
        Minter: new TestMinter__factory(owner),
        RECoverable: new TestRECoverable__factory(owner),
        StringHelper: new TestStringHelper__factory(owner),
        RERC20: new TestRERC20__factory(owner),
        UUPSUpgradeable: new TestUUPSUpgradeable__factory(owner),
        DummyStableswap: new TestDummyStableswap__factory(owner),
        DummyGauge: new TestDummyGauge__factory(owner),
        SelfStakingERC20: new TestSelfStakingERC20__factory(owner),
        BridgeRERC20: new TestBridgeRERC20__factory(owner),
        BridgeSelfStakingERC20: new TestBridgeSelfStakingERC20__factory(owner),
        REBacking: new TestREBacking__factory(owner),
        CheapSafeERC20: new TestCheapSafeERC20__factory(owner),
        UUPSUpgradeableVersion: new TestUUPSUpgradeableVersion__factory(owner),
        REClaimer: new TestREClaimer__factory(owner),
        RECurveBlargitrage: new TestRECurveBlargitrage__factory(owner),
        RECurveZapper: new TestRECurveZapper__factory(owner),
        GrumpyERC20: new TestGrumpyERC20__factory(owner),
        REUSDExit: new TestREUSDExit__factory(owner),
        REBlank: new TestREBlank__factory(owner)
    }
    return lastFactories
}