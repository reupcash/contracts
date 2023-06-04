import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestREStablecoins } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import deployStablecoins from "./helpers/deployStablecoins"
const { utils, constants } = ethers

const factor6 = utils.parseUnits("1", 12)

describe("REStablecoins", function () {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let factories: ContractFactories
    let stablecoins: TestREStablecoins
    let USDC: ERC20
    let USDT: ERC20
    let DAI: ERC20

    beforeEach(async function () {
        ; ([owner, user1] = await ethers.getSigners());
        ; ({ DAI, USDC, USDT } = await deployStablecoins(owner));
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        stablecoins = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, USDT.address, DAI.address] }) as TestREStablecoins
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, USDT.address, DAI.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, USDT.address, DAI.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("initializes as expected", async function () {
        expect(await stablecoins.owner()).to.equal(owner.address)
        expect(await stablecoins.getStablecoin1()).to.equal(USDC.address)
        expect(await stablecoins.getStablecoin2()).to.equal(USDT.address)
        expect(await stablecoins.getStablecoin3()).to.equal(DAI.address)
        const coins = await stablecoins.supported()
        expect(coins.length).to.equal(3)
        expect(coins[0].token).to.equal(USDC.address)
        expect(coins[0].decimals).to.equal(6)
        expect(coins[1].token).to.equal(USDT.address)
        expect(coins[1].decimals).to.equal(6)
        expect(coins[2].token).to.equal(DAI.address)
        expect(coins[2].decimals).to.equal(18)
    })

    it("owner functions fail for non-owner", async function () {
        await expect(stablecoins.connect(user1).add(USDC.address)).to.be.revertedWithCustomError(stablecoins, "NotOwner")
        await expect(stablecoins.connect(user1).remove(USDC.address)).to.be.revertedWithCustomError(stablecoins, "NotOwner")
    })

    it("add fails if existing", async function () {
        await expect(stablecoins.connect(owner).add(USDC.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
        await expect(stablecoins.connect(owner).add(USDT.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
        await expect(stablecoins.connect(owner).add(DAI.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
    })

    it("remove fails for built-in", async function () {
        await expect(stablecoins.connect(owner).remove(USDC.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
        await expect(stablecoins.connect(owner).remove(USDT.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
        await expect(stablecoins.connect(owner).remove(DAI.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
    })

    it("getDecimals works", async function () {
        await expect(await stablecoins.getMultiplyFactor(USDC.address)).to.equal(factor6)
        await expect(await stablecoins.getMultiplyFactor(USDT.address)).to.equal(factor6)
        await expect(await stablecoins.getMultiplyFactor(DAI.address)).to.equal(1)
    })

    it("getDecimals fails for address(0)", async function () {
        await expect(stablecoins.getMultiplyFactor(constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })
    it("getDecimals fails for non-existent", async function () {
        await expect(stablecoins.getMultiplyFactor(user1.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })

    it("add fails for decimals != 6 or 18", async function () {
        const erc = await factories.ERC20.deploy()
        await erc.setDecimals(5)
        await expect(stablecoins.connect(owner).add(erc.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })

    it("deploy fails for decimals != 6 or 18", async function () {
        const erc = await factories.ERC20.deploy()
        await erc.setDecimals(5)
        await expect(factories.REStablecoins.deploy(erc.address, constants.AddressZero, constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })

    describe("add (3 more)", function () {
        let USDC2: ERC20
        let USDT2: ERC20
        let DAI2: ERC20

        beforeEach(async function () {
            ; ({ DAI: DAI2, USDC: USDC2, USDT: USDT2 } = await deployStablecoins(owner));
            await stablecoins.connect(owner).add(USDC2.address)
            await stablecoins.connect(owner).add(USDT2.address)
            await stablecoins.connect(owner).add(DAI2.address)
        })

        it("initializes as expected", async function () {
            expect(await stablecoins.owner()).to.equal(owner.address)
            expect(await stablecoins.getStablecoin1()).to.equal(USDC.address)
            expect(await stablecoins.getStablecoin2()).to.equal(USDT.address)
            expect(await stablecoins.getStablecoin3()).to.equal(DAI.address)
            const coins = await stablecoins.supported()
            expect(coins.length).to.equal(6)
            expect(coins[0].token).to.equal(USDC.address)
            expect(coins[0].decimals).to.equal(6)
            expect(coins[0].name).to.equal(await USDT.name())
            expect(coins[0].symbol).to.equal(await USDT.symbol())
            expect(coins[1].token).to.equal(USDT.address)
            expect(coins[1].decimals).to.equal(6)
            expect(coins[2].token).to.equal(DAI.address)
            expect(coins[2].decimals).to.equal(18)
            expect(coins[2].name).to.equal(await DAI.name())
            expect(coins[2].symbol).to.equal(await DAI.symbol())
            expect(coins.filter(x => x.token === USDC2.address)[0].token).to.equal(USDC2.address)
            expect(coins.filter(x => x.token === USDC2.address)[0].decimals).to.equal(6)
            expect(coins.filter(x => x.token === USDT2.address)[0].token).to.equal(USDT2.address)
            expect(coins.filter(x => x.token === USDT2.address)[0].decimals).to.equal(6)
            expect(coins.filter(x => x.token === DAI2.address)[0].token).to.equal(DAI2.address)
            expect(coins.filter(x => x.token === DAI2.address)[0].decimals).to.equal(18)
            expect(coins.filter(x => x.token === DAI2.address)[0].name).to.equal(await DAI2.name())
            expect(coins.filter(x => x.token === DAI2.address)[0].symbol).to.equal(await DAI2.symbol())
        })

        it("add fails if existing", async function () {
            await expect(stablecoins.connect(owner).add(USDC.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).add(USDT.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).add(DAI.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).add(USDC2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).add(USDT2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).add(DAI2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
        })

        it("remove fails for built-in", async function () {
            await expect(stablecoins.connect(owner).remove(USDC.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
            await expect(stablecoins.connect(owner).remove(USDT.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
            await expect(stablecoins.connect(owner).remove(DAI.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
        })

        it("getDecimals works", async function () {
            await expect(await stablecoins.getMultiplyFactor(USDC.address)).to.equal(factor6)
            await expect(await stablecoins.getMultiplyFactor(USDT.address)).to.equal(factor6)
            await expect(await stablecoins.getMultiplyFactor(DAI.address)).to.equal(1)
            await expect(await stablecoins.getMultiplyFactor(USDC2.address)).to.equal(factor6)
            await expect(await stablecoins.getMultiplyFactor(USDT2.address)).to.equal(factor6)
            await expect(await stablecoins.getMultiplyFactor(DAI2.address)).to.equal(1)
        })

        it("getDecimals fails for address(0)", async function () {
            await expect(stablecoins.getMultiplyFactor(constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        })
        it("getDecimals fails for non-existent", async function () {
            await expect(stablecoins.getMultiplyFactor(user1.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        })

        describe("extra stablecoins removed", async function () {
            beforeEach(async function () {
                await stablecoins.connect(owner).remove(USDC2.address)
                await stablecoins.connect(owner).remove(USDT2.address)
                await stablecoins.connect(owner).remove(DAI2.address)
            })

            it("initializes as expected", async function () {
                expect(await stablecoins.owner()).to.equal(owner.address)
                expect(await stablecoins.getStablecoin1()).to.equal(USDC.address)
                expect(await stablecoins.getStablecoin2()).to.equal(USDT.address)
                expect(await stablecoins.getStablecoin3()).to.equal(DAI.address)
                const coins = await stablecoins.supported()
                expect(coins.length).to.equal(3)
                expect(coins[0].token).to.equal(USDC.address)
                expect(coins[0].decimals).to.equal(6)
                expect(coins[1].token).to.equal(USDT.address)
                expect(coins[1].decimals).to.equal(6)
                expect(coins[2].token).to.equal(DAI.address)
                expect(coins[2].decimals).to.equal(18)
            })

            it("remove fails for already-removed", async function () {
                await expect(stablecoins.connect(owner).remove(USDC2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinDoesNotExist")
                await expect(stablecoins.connect(owner).remove(USDT2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinDoesNotExist")
                await expect(stablecoins.connect(owner).remove(DAI2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinDoesNotExist")
            })

            it("getDecimals works", async function () {
                await expect(await stablecoins.getMultiplyFactor(USDC.address)).to.equal(factor6)
                await expect(await stablecoins.getMultiplyFactor(USDT.address)).to.equal(factor6)
                await expect(await stablecoins.getMultiplyFactor(DAI.address)).to.equal(1)
            })

            it("getDecimals fails for address(0)", async function () {
                await expect(stablecoins.getMultiplyFactor(constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
            })

            it("getDecimals fails for non-existent", async function () {
                await expect(stablecoins.getMultiplyFactor(user1.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
            })

            it("getDecimals fails for removed", async function () {
                await expect(stablecoins.getMultiplyFactor(USDC2.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
                await expect(stablecoins.getMultiplyFactor(USDT2.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
                await expect(stablecoins.getMultiplyFactor(DAI2.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
            })
        })
    })

    describe("no built-ins", function () {
        beforeEach(async function () {
            stablecoins = await factories.REStablecoins.deploy(constants.AddressZero, constants.AddressZero, constants.AddressZero)
        })

        it("initialized as expected", async function () {
            expect(await stablecoins.owner()).to.equal(owner.address)
            const coins = await stablecoins.supported()
            expect(coins.length).to.equal(0)
        })

        it("add/remove works", async function () {
            await stablecoins.add(USDC.address)
            let coins = await stablecoins.supported()
            expect(coins.length).to.equal(1)
            expect(coins[0].token).to.equal(USDC.address)
            expect(coins[0].decimals).to.equal(6)
            expect(await stablecoins.getMultiplyFactor(USDC.address)).to.equal(factor6)
            await stablecoins.remove(USDC.address)
            coins = await stablecoins.supported()
            expect(coins.length).to.equal(0)
            await expect(stablecoins.getMultiplyFactor(USDC.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        })
    })
})