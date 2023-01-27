import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import { TestREClaimer, TestREClaimer_SelfStakingERC20, TestREClaimer_SelfStakingERC20__factory } from "../typechain-types"
import { TestDummyGauge } from "../typechain-types/contracts/Test/TestDummyGauge"
const { constants } = ethers

describe("REClaimer", function () {
    let factories: ContractFactories
    let REClaimer: TestREClaimer
    let owner: SignerWithAddress
    const erc20s: TestREClaimer_SelfStakingERC20[] = []
    const gauges: TestDummyGauge[] = []

    beforeEach(async function () {
        ; ([owner] = await ethers.getSigners());
        factories = await createContractFactories(owner)
        upgrades.silenceWarnings()
        REClaimer = await upgrades.deployProxy(factories.REClaimer, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestREClaimer
        const erc20factory = new TestREClaimer_SelfStakingERC20__factory(owner)
        erc20s.push(await erc20factory.deploy())
        erc20s.push(await erc20factory.deploy())
        erc20s.push(await erc20factory.deploy())
        gauges.push(await factories.DummyGauge.deploy(constants.AddressZero))
        gauges.push(await factories.DummyGauge.deploy(constants.AddressZero))
        gauges.push(await factories.DummyGauge.deploy(constants.AddressZero))
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REClaimer, { unsafeAllow: ["delegatecall"], kind: "uups" })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REClaimer, { unsafeAllow: ["delegatecall"], kind: "uups" })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REClaimer, { unsafeAllow: ["delegatecall"], kind: "uups" })
        await expect(upgrades.upgradeProxy(c, factories.REClaimer, { unsafeAllow: ["delegatecall"], kind: "uups" })).to.be.revertedWithCustomError(REClaimer, "UpgradeToSameVersion")
    })

    it("claim with nothing works", async function() {
        await REClaimer.claim([], [])
    })

    it("claim calls all", async function() {
        await REClaimer.connect(owner).claim(gauges.map(x => x.address), erc20s.map(x => x.address))
        for (let gauge of gauges) {
            expect(await gauge.claimRewardsAddress()).to.equal(owner.address)
        }
        for (let erc20 of erc20s) {
            expect(await erc20.claimForAddress()).to.equal(owner.address)
        }
    })
})