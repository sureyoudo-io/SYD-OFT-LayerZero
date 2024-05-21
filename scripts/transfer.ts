import 'dotenv/config'
import { ethers } from 'ethers'
import winston from 'winston'

import { Options } from '@layerzerolabs/lz-v2-utilities'

import hhConfig from '../hardhat.config'

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
    ),
    transports: [new winston.transports.Console()],
})

type NetworkConfig = {
    eid: number
    url: string
    accounts: string[]
    contractAbi: ethers.ContractInterface
    contractAddress: string
}

// Load configuration
const LAYERZERO_ENDPOINT_ADDRESS = '0x6EDCE65403992e310A62460808c4b910D972f10f'

async function transferTokens(amount: string, sourceChain: NetworkConfig, destinationChain: NetworkConfig) {
    // Connect to the source and destination chains
    const sourceProvider = new ethers.providers.JsonRpcProvider(sourceChain.url)
    const destinationProvider = new ethers.providers.JsonRpcProvider(destinationChain.url)

    const sourceWallet = new ethers.Wallet(sourceChain.accounts[0], sourceProvider)
    const destinationWallet = new ethers.Wallet(destinationChain.accounts[0], destinationProvider)

    // Get the contract instances on the source and destination chains
    const sourceContract = new ethers.Contract(sourceChain.contractAddress, sourceChain.contractAbi, sourceWallet)
    const destinationContract = new ethers.Contract(
        destinationChain.contractAddress,
        destinationChain.contractAbi,
        destinationWallet
    )

    // Get the owner's account on the source chain
    const sourceOwner = new ethers.Wallet(sourceChain.accounts[0], sourceProvider)

    // Get the owner's account on the destination chain
    const destinationOwner = new ethers.Wallet(destinationChain.accounts[0], destinationProvider)

    // Define the amount of tokens to send
    const tokensToSend = ethers.utils.parseEther(amount)

    logger.info(`Starting transfer of ${amount} tokens`)

    // Check if LZ endpoint has proper allowance
    const allowance = await sourceContract.allowance(sourceOwner.address, LAYERZERO_ENDPOINT_ADDRESS)
    if (parseFloat(ethers.utils.formatEther(allowance)) < parseFloat(amount)) {
        // Approve LayerZero Endpoint to spend tokens
        logger.info('Approving SYD spend for LZ endpoint...')
        const approveTx = await sourceContract.approve(LAYERZERO_ENDPOINT_ADDRESS, tokensToSend)
        await approveTx.wait()
        logger.info(`Approved ${amount} tokens to LayerZero Endpoint`)
    }

    const isSourcePeerSet = await sourceContract.isPeer(
        destinationChain.eid,
        ethers.utils.zeroPad(destinationContract.address, 32)
    )
    if (!isSourcePeerSet) {
        logger.info('Setting peer on source contract...')
        const settingPeer = await sourceContract
            .connect(sourceWallet)
            .setPeer(destinationChain.eid, ethers.utils.zeroPad(destinationContract.address, 32))

        await settingPeer.wait()
        logger.info('Peer set on source contract')
    } else {
        logger.info('Peer already set on source contract')
    }

    const isDestPeerSet = await destinationContract.isPeer(
        sourceChain.eid,
        ethers.utils.zeroPad(sourceContract.address, 32)
    )
    if (!isDestPeerSet) {
        logger.info('Setting peer on destination contract...')
        const settingPeer = await destinationContract
            .connect(destinationWallet)
            .setPeer(sourceChain.eid, ethers.utils.zeroPad(sourceContract.address, 32))

        await settingPeer.wait()
        logger.info('Peer set on destination contract')
    } else {
        logger.info('Peer already set on destination contract')
    }

    // Define extra message execution options for the send operation
    const options = Options.newOptions().addExecutorLzReceiveOption(20000, 0).toHex().toString()

    const sendParam = {
        dstEid: destinationChain.eid,
        amountLD: tokensToSend,
        minAmountLD: tokensToSend,
        to: ethers.utils.zeroPad(destinationOwner.address, 32),
        extraOptions: options,
        composeMsg: '0x',
        oftCmd: '0x',
    }

    // Fetch the native fee for the token send operation
    const [nativeFee] = await sourceContract.quoteSend(sendParam, false)

    logger.info(`Estimated gas fee for the token transfer operation: ${ethers.utils.formatEther(nativeFee)}`, {
        nativeFee,
    })

    // Execute the send operation from the source contract
    const tx = await sourceContract.send(sendParam, [nativeFee, 0], sourceOwner.address, { value: nativeFee })

    logger.info(`Token transfer operation initiated; txHash: ${tx.hash}`, { txHash: tx.hash })

    // Wait for the transaction to be mined
    const receipt = await tx.wait()

    logger.info(`Token transfer operation completed; txHash: ${receipt.transactionHash}`, {
        txHash: receipt.transactionHash,
    })

    // log owner balances
    const sourceOwnerBalance = await sourceContract.balanceOf(sourceOwner.address)
    const destinationOwnerBalance = await destinationContract.balanceOf(destinationOwner.address)
    logger.info(`Source owner balance: ${ethers.utils.formatEther(sourceOwnerBalance)}`)
    logger.info(`Destination owner balance: ${ethers.utils.formatEther(destinationOwnerBalance)}`)
}

const getNetworkConfig = async (networkName: string, contractAddress: string): Promise<NetworkConfig> => {
    const networks = hhConfig.networks
    if (!networks) {
        throw new Error('Networks not found in hardhat.config.ts')
    }
    const network = networks[networkName]
    if (!network) {
        throw new Error(`Network "${networkName}" not found in hardhat.config.ts`)
    }

    let contractAbi = null
    try {
        const { abi } = await import(`../deployments/${networkName}/SYD.json`)
        contractAbi = abi
    } catch {
        throw new Error(`Cannot import ABI for ${networkName}`)
    }
    return {
        ...network,
        contractAbi,
        contractAddress,
    } as NetworkConfig
}

const main = async () => {
    const destinationChain = await getNetworkConfig('baseSepolia', '0xf41c4631B58C6e839ba8f35D44819eA7CA56DDB8')
    const sourceChain = await getNetworkConfig('sepolia', '0x89d224A430cCb9bfde3F14B4A11F1C1050c915B9')
    const amount = '1101'

    await transferTokens(amount, sourceChain, destinationChain)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error?.message || error)
        process.exit(1)
    })
