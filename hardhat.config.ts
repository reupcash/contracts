import { HardhatUserConfig } from "hardhat/config"
import "hardhat-contract-sizer"
import "@openzeppelin/hardhat-upgrades"
import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-etherscan"
import "@typechain/hardhat"
import "solidity-coverage"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 99999
      },
      viaIR: true /* Set to false to run `npx hardhat coverage` */
    }
  },
  gasReporter: {
    enabled: false
  },
  networks: {
    mainnet: {
      url: "https://mainnet.infura.io/v3/32c733c3e2664c4a8de6b673f5725b97"
    }
  },
  etherscan: {
    apiKey: {
      mainnet: "TBWRD6BIJ3DSF8F1WD8ESNECCIRXJ5DIRP",
      bsc: "KNEGPMNNZ3NFXTRNKZNCYQ4J38NFP694JK",
      opera: "WMU7KNWJPPSEKA6ZIH4PCHU1SUFZA8PZW7",
      avalanche: "3K4XJU34XS7YXDEZ5N1STAGQ2FWJDJCKPH"
    }
  }
}

export default config