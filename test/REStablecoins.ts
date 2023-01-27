import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestREStablecoins } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import deployStablecoins from "./helpers/deployStablecoins"
const { constants } = ethers

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
        stablecoins = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [{ token: USDC.address, decimals: 6, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true }] }) as TestREStablecoins
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [{ token: USDC.address, decimals: 6, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true }] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [{ token: USDC.address, decimals: 6, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true }] })
        expect(c.address).to.equal(c2.address)
    })

    it("initializes as expected", async function () {
        expect(await stablecoins.owner()).to.equal(owner.address)
        expect((await stablecoins.getStablecoin1()).token).to.equal(USDC.address)
        expect((await stablecoins.getStablecoin1()).decimals).to.equal(6)
        expect((await stablecoins.getStablecoin1()).hasPermit).to.equal(true)
        expect((await stablecoins.getStablecoin2()).token).to.equal(USDT.address)
        expect((await stablecoins.getStablecoin2()).decimals).to.equal(6)
        expect((await stablecoins.getStablecoin2()).hasPermit).to.equal(false)
        expect((await stablecoins.getStablecoin3()).token).to.equal(DAI.address)
        expect((await stablecoins.getStablecoin3()).decimals).to.equal(18)
        expect((await stablecoins.getStablecoin3()).hasPermit).to.equal(true)
        const coins = await stablecoins.supportedStablecoins()
        expect(coins.length).to.equal(3)
        expect(coins[0].config.token).to.equal(USDC.address)
        expect(coins[0].config.decimals).to.equal(6)
        expect(coins[0].config.hasPermit).to.equal(true)
        expect(coins[1].config.token).to.equal(USDT.address)
        expect(coins[1].config.decimals).to.equal(6)
        expect(coins[1].config.hasPermit).to.equal(false)
        expect(coins[2].config.token).to.equal(DAI.address)
        expect(coins[2].config.decimals).to.equal(18)
        expect(coins[2].config.hasPermit).to.equal(true)
    })

    it("wrong number of decimals fails", async function () {
        await expect(factories.REStablecoins.deploy({ token: USDC.address, decimals: 18, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true })).to.be.revertedWithCustomError(stablecoins, "TokenMisconfigured")
        await expect(factories.REStablecoins.deploy({ token: USDC.address, decimals: 6, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 6, hasPermit: true })).to.be.revertedWithCustomError(stablecoins, "TokenMisconfigured")
        await expect(factories.REStablecoins.deploy({ token: USDC.address, decimals: 6, hasPermit: true }, { token: USDT.address, decimals: 18, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true })).to.be.revertedWithCustomError(stablecoins, "TokenMisconfigured")
    })

    it("owner functions fail for non-owner", async function () {
        await expect(stablecoins.connect(user1).addStablecoin(USDC.address, true)).to.be.revertedWithCustomError(stablecoins, "NotOwner")
        await expect(stablecoins.connect(user1).removeStablecoin(USDC.address)).to.be.revertedWithCustomError(stablecoins, "NotOwner")
    })

    it("addStablecoin fails if existing", async function () {
        await expect(stablecoins.connect(owner).addStablecoin(USDC.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
        await expect(stablecoins.connect(owner).addStablecoin(USDT.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
        await expect(stablecoins.connect(owner).addStablecoin(DAI.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
    })

    it("removeStablecoin fails for built-in", async function () {
        await expect(stablecoins.connect(owner).removeStablecoin(USDC.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
        await expect(stablecoins.connect(owner).removeStablecoin(USDT.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
        await expect(stablecoins.connect(owner).removeStablecoin(DAI.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
    })

    it("getStablecoinConfig works for USDC", async function () {
        const config = await stablecoins.getStablecoinConfig(USDC.address)
        await expect(config.token).to.equal(USDC.address)
        await expect(config.decimals).to.equal(6)
        await expect(config.hasPermit).to.equal(true)
    })

    it("getStablecoinConfig works for USDT", async function () {
        const config = await stablecoins.getStablecoinConfig(USDT.address)
        await expect(config.token).to.equal(USDT.address)
        await expect(config.decimals).to.equal(6)
        await expect(config.hasPermit).to.equal(false)
    })

    it("getStablecoinConfig works for DAI", async function () {
        const config = await stablecoins.getStablecoinConfig(DAI.address)
        await expect(config.token).to.equal(DAI.address)
        await expect(config.decimals).to.equal(18)
        await expect(config.hasPermit).to.equal(true)
    })

    it("getStablecoinConfig fails for address(0)", async function () {
        await expect(stablecoins.getStablecoinConfig(constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })
    it("getStablecoinConfig fails for non-existent", async function () {
        await expect(stablecoins.getStablecoinConfig(user1.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })

    it("add fails for decimals != 6 or 18", async function () {
        const erc = await factories.ERC20.deploy()
        await erc.setDecimals(5)
        await expect(stablecoins.connect(owner).addStablecoin(erc.address, true)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })

    it("deploy fails for decimals != 6 or 18", async function () {
        const erc = await factories.ERC20.deploy()
        await erc.setDecimals(5)
        await expect(factories.REStablecoins.deploy({ token: erc.address, decimals: 5, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true })).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
    })

    it("deploy fails for decimals mismatch", async function () {
        const erc = await factories.ERC20.deploy()
        await erc.setDecimals(5)
        await expect(factories.REStablecoins.deploy({ token: erc.address, decimals: 6, hasPermit: true }, { token: USDT.address, decimals: 6, hasPermit: false }, { token: DAI.address, decimals: 18, hasPermit: true })).to.be.revertedWithCustomError(stablecoins, "TokenMisconfigured")
    })

    describe("addStablecoin (3 more)", function () {
        let USDC2: ERC20
        let USDT2: ERC20
        let DAI2: ERC20

        beforeEach(async function () {
            ; ({ DAI: DAI2, USDC: USDC2, USDT: USDT2 } = await deployStablecoins(owner));
            await stablecoins.connect(owner).addStablecoin(USDC2.address, true)
            await stablecoins.connect(owner).addStablecoin(USDT2.address, false)
            await stablecoins.connect(owner).addStablecoin(DAI2.address, true)
        })

        it("initializes as expected", async function () {
            expect(await stablecoins.owner()).to.equal(owner.address)
            expect((await stablecoins.getStablecoin1()).token).to.equal(USDC.address)
            expect((await stablecoins.getStablecoin1()).decimals).to.equal(6)
            expect((await stablecoins.getStablecoin1()).hasPermit).to.equal(true)
            expect((await stablecoins.getStablecoin2()).token).to.equal(USDT.address)
            expect((await stablecoins.getStablecoin2()).decimals).to.equal(6)
            expect((await stablecoins.getStablecoin2()).hasPermit).to.equal(false)
            expect((await stablecoins.getStablecoin3()).token).to.equal(DAI.address)
            expect((await stablecoins.getStablecoin3()).decimals).to.equal(18)
            expect((await stablecoins.getStablecoin3()).hasPermit).to.equal(true)
            const coins = await stablecoins.supportedStablecoins()
            expect(coins.length).to.equal(6)
            expect(coins[0].config.token).to.equal(USDC.address)
            expect(coins[0].config.decimals).to.equal(6)
            expect(coins[0].config.hasPermit).to.equal(true)
            expect(coins[0].name).to.equal(await USDT.name())
            expect(coins[0].symbol).to.equal(await USDT.symbol())
            expect(coins[1].config.token).to.equal(USDT.address)
            expect(coins[1].config.decimals).to.equal(6)
            expect(coins[1].config.hasPermit).to.equal(false)
            expect(coins[2].config.token).to.equal(DAI.address)
            expect(coins[2].config.decimals).to.equal(18)
            expect(coins[2].config.hasPermit).to.equal(true)
            expect(coins[2].name).to.equal(await DAI.name())
            expect(coins[2].symbol).to.equal(await DAI.symbol())
            expect(coins.filter(x => x.config.token === USDC2.address)[0].config.token).to.equal(USDC2.address)
            expect(coins.filter(x => x.config.token === USDC2.address)[0].config.decimals).to.equal(6)
            expect(coins.filter(x => x.config.token === USDC2.address)[0].config.hasPermit).to.equal(true)
            expect(coins.filter(x => x.config.token === USDT2.address)[0].config.token).to.equal(USDT2.address)
            expect(coins.filter(x => x.config.token === USDT2.address)[0].config.decimals).to.equal(6)
            expect(coins.filter(x => x.config.token === USDT2.address)[0].config.hasPermit).to.equal(false)
            expect(coins.filter(x => x.config.token === DAI2.address)[0].config.token).to.equal(DAI2.address)
            expect(coins.filter(x => x.config.token === DAI2.address)[0].config.decimals).to.equal(18)
            expect(coins.filter(x => x.config.token === DAI2.address)[0].config.hasPermit).to.equal(true)
            expect(coins.filter(x => x.config.token === DAI2.address)[0].name).to.equal(await DAI2.name())
            expect(coins.filter(x => x.config.token === DAI2.address)[0].symbol).to.equal(await DAI2.symbol())
        })

        it("addStablecoin fails if existing", async function () {
            await expect(stablecoins.connect(owner).addStablecoin(USDC.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).addStablecoin(USDT.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).addStablecoin(DAI.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).addStablecoin(USDC2.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).addStablecoin(USDT2.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
            await expect(stablecoins.connect(owner).addStablecoin(DAI2.address, true)).to.be.revertedWithCustomError(stablecoins, "StablecoinAlreadyExists")
        })

        it("removeStablecoin fails for built-in", async function () {
            await expect(stablecoins.connect(owner).removeStablecoin(USDC.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
            await expect(stablecoins.connect(owner).removeStablecoin(USDT.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
            await expect(stablecoins.connect(owner).removeStablecoin(DAI.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinBakedIn")
        })

        it("getStablecoinConfig works for USDC", async function () {
            const config = await stablecoins.getStablecoinConfig(USDC.address)
            await expect(config.token).to.equal(USDC.address)
            await expect(config.decimals).to.equal(6)
            await expect(config.hasPermit).to.equal(true)
        })

        it("getStablecoinConfig works for USDT", async function () {
            const config = await stablecoins.getStablecoinConfig(USDT.address)
            await expect(config.token).to.equal(USDT.address)
            await expect(config.decimals).to.equal(6)
            await expect(config.hasPermit).to.equal(false)
        })

        it("getStablecoinConfig works for DAI", async function () {
            const config = await stablecoins.getStablecoinConfig(DAI.address)
            await expect(config.token).to.equal(DAI.address)
            await expect(config.decimals).to.equal(18)
            await expect(config.hasPermit).to.equal(true)
        })

        it("getStablecoinConfig works for USDC2", async function () {
            const config = await stablecoins.getStablecoinConfig(USDC2.address)
            await expect(config.token).to.equal(USDC2.address)
            await expect(config.decimals).to.equal(6)
            await expect(config.hasPermit).to.equal(true)
        })

        it("getStablecoinConfig works for USDT2", async function () {
            const config = await stablecoins.getStablecoinConfig(USDT2.address)
            await expect(config.token).to.equal(USDT2.address)
            await expect(config.decimals).to.equal(6)
            await expect(config.hasPermit).to.equal(false)
        })

        it("getStablecoinConfig works for DAI2", async function () {
            const config = await stablecoins.getStablecoinConfig(DAI2.address)
            await expect(config.token).to.equal(DAI2.address)
            await expect(config.decimals).to.equal(18)
            await expect(config.hasPermit).to.equal(true)
        })

        it("getStablecoinConfig fails for address(0)", async function () {
            await expect(stablecoins.getStablecoinConfig(constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        })
        it("getStablecoinConfig fails for non-existent", async function () {
            await expect(stablecoins.getStablecoinConfig(user1.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        })

        describe("extra stablecoins removed", async function () {
            beforeEach(async function () {
                await stablecoins.connect(owner).removeStablecoin(USDC2.address)
                await stablecoins.connect(owner).removeStablecoin(USDT2.address)
                await stablecoins.connect(owner).removeStablecoin(DAI2.address)
            })

            it("initializes as expected", async function () {
                expect(await stablecoins.owner()).to.equal(owner.address)
                expect((await stablecoins.getStablecoin1()).token).to.equal(USDC.address)
                expect((await stablecoins.getStablecoin1()).decimals).to.equal(6)
                expect((await stablecoins.getStablecoin1()).hasPermit).to.equal(true)
                expect((await stablecoins.getStablecoin2()).token).to.equal(USDT.address)
                expect((await stablecoins.getStablecoin2()).decimals).to.equal(6)
                expect((await stablecoins.getStablecoin2()).hasPermit).to.equal(false)
                expect((await stablecoins.getStablecoin3()).token).to.equal(DAI.address)
                expect((await stablecoins.getStablecoin3()).decimals).to.equal(18)
                expect((await stablecoins.getStablecoin3()).hasPermit).to.equal(true)
                const coins = await stablecoins.supportedStablecoins()
                expect(coins.length).to.equal(3)
                expect(coins[0].config.token).to.equal(USDC.address)
                expect(coins[0].config.decimals).to.equal(6)
                expect(coins[0].config.hasPermit).to.equal(true)
                expect(coins[1].config.token).to.equal(USDT.address)
                expect(coins[1].config.decimals).to.equal(6)
                expect(coins[1].config.hasPermit).to.equal(false)
                expect(coins[2].config.token).to.equal(DAI.address)
                expect(coins[2].config.decimals).to.equal(18)
                expect(coins[2].config.hasPermit).to.equal(true)
            })

            it("removeStablecoin fails for already-removed", async function () {
                await expect(stablecoins.connect(owner).removeStablecoin(USDC2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinDoesNotExist")
                await expect(stablecoins.connect(owner).removeStablecoin(USDT2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinDoesNotExist")
                await expect(stablecoins.connect(owner).removeStablecoin(DAI2.address)).to.be.revertedWithCustomError(stablecoins, "StablecoinDoesNotExist")
            })

            it("getStablecoinConfig works for USDC", async function () {
                const config = await stablecoins.getStablecoinConfig(USDC.address)
                await expect(config.token).to.equal(USDC.address)
                await expect(config.decimals).to.equal(6)
                await expect(config.hasPermit).to.equal(true)
            })

            it("getStablecoinConfig works for USDT", async function () {
                const config = await stablecoins.getStablecoinConfig(USDT.address)
                await expect(config.token).to.equal(USDT.address)
                await expect(config.decimals).to.equal(6)
                await expect(config.hasPermit).to.equal(false)
            })

            it("getStablecoinConfig works for DAI", async function () {
                const config = await stablecoins.getStablecoinConfig(DAI.address)
                await expect(config.token).to.equal(DAI.address)
                await expect(config.decimals).to.equal(18)
                await expect(config.hasPermit).to.equal(true)
            })

            it("getStablecoinConfig fails for address(0)", async function () {
                await expect(stablecoins.getStablecoinConfig(constants.AddressZero)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
            })

            it("getStablecoinConfig fails for non-existent", async function () {
                await expect(stablecoins.getStablecoinConfig(user1.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
            })

            it("getStablecoinConfig fails for removed", async function () {
                await expect(stablecoins.getStablecoinConfig(USDC2.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
                await expect(stablecoins.getStablecoinConfig(USDT2.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
                await expect(stablecoins.getStablecoinConfig(DAI2.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
            })
        })
    })

    describe("no built-ins", function () {
        beforeEach(async function () {
            stablecoins = await factories.REStablecoins.deploy({ token: constants.AddressZero, decimals: 0, hasPermit: false }, { token: constants.AddressZero, decimals: 6, hasPermit: true }, { token: constants.AddressZero, decimals: 200, hasPermit: true })
        })

        it("initialized as expected", async function () {
            expect(await stablecoins.owner()).to.equal(owner.address)
            const coins = await stablecoins.supportedStablecoins()
            expect(coins.length).to.equal(0)
        })

        it("add/remove works", async function () {
            await stablecoins.addStablecoin(USDC.address, true)
            let coins = await stablecoins.supportedStablecoins()
            expect(coins.length).to.equal(1)
            expect(coins[0].config.token).to.equal(USDC.address)
            expect(coins[0].config.decimals).to.equal(6)
            expect(coins[0].config.hasPermit).to.equal(true)
            const config = await stablecoins.getStablecoinConfig(USDC.address)
            expect(config.token).to.equal(USDC.address)
            expect(config.decimals).to.equal(6)
            expect(config.hasPermit).to.equal(true)
            await stablecoins.removeStablecoin(USDC.address)
            coins = await stablecoins.supportedStablecoins()
            expect(coins.length).to.equal(0)
            await expect(stablecoins.getStablecoinConfig(USDC.address)).to.be.revertedWithCustomError(stablecoins, "TokenNotSupported")
        })
    })
})