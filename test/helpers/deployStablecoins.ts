import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import createContractFactories from "./createContractFactories"

export default async function deployStablecoins(owner: SignerWithAddress) {
    const factories = createContractFactories(owner)
    const USDC = await factories.ERC20.deploy()
    const USDT = await factories.ERC20.deploy()
    const DAI = await factories.ERC20.deploy()
    await USDC.setDecimals(6)
    await USDT.setDecimals(6)
    return { USDC, USDT, DAI }
}