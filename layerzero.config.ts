import { EndpointId } from '@layerzerolabs/lz-definitions'

import type { OAppOmniGraphHardhat, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

// Chains to deploy contract on:
// - BSC
// - Polygon
// - Avalanche
// - Arbitrum
// - Optimism
// - Base
// - Fantom

const ethSepoliaContract: OmniPointHardhat = {
    eid: EndpointId.SEPOLIA_V2_TESTNET,
    contractName: 'SureYouDo.io',
}

const baseSepoliaContract: OmniPointHardhat = {
    eid: EndpointId.BASESEP_V2_TESTNET,
    contractName: 'SureYouDo.io',
}

const config: OAppOmniGraphHardhat = {
    contracts: [
        {
            contract: baseSepoliaContract,
        },
        {
            contract: ethSepoliaContract,
        },
    ],
    connections: [
        {
            from: baseSepoliaContract,
            to: ethSepoliaContract,
        },
        {
            from: ethSepoliaContract,
            to: baseSepoliaContract,
        },
    ],
}

export default config
