const hre = require('hardhat');
const {
    getAddrFromRegistry,
    impersonateAccount,
    stopImpersonatingAccount,
    getGasUsed,
    calcGasToUSD,
    OWNER_ACC,
    AVG_GAS_PRICE,
} = require('./utils');

const getLatestStrategyId = async () => {
    const strategyStorageAddr = await getAddrFromRegistry('StrategyStorage');

    const strategyStorageInstance = await hre.ethers.getContractFactory('StrategyStorage');
    const strategyStorage = await strategyStorageInstance.attach(strategyStorageAddr);

    let latestStrategyId = await strategyStorage.getStrategyCount();
    latestStrategyId = (latestStrategyId - 1).toString();

    return latestStrategyId;
};

const getLatestSubId = async () => {
    const subStorageAddr = await getAddrFromRegistry('SubStorage');

    const subStorageInstance = await hre.ethers.getContractFactory('SubStorage');
    const subStorage = await subStorageInstance.attach(subStorageAddr);

    let latestSubId = await subStorage.getSubsCount();
    latestSubId = (latestSubId - 1).toString();

    return latestSubId;
};

// eslint-disable-next-line max-len
const createStrategy = async (proxy, strategyName, triggerIds, actionIds, paramMapping, continuous) => {
    const strategyProxyAddr = await getAddrFromRegistry('StrategyProxy');

    const StrategyProxy = await hre.ethers.getContractFactory('StrategyProxy');

    const functionData = StrategyProxy.interface.encodeFunctionData(
        'createStrategy',
        [strategyName, triggerIds, actionIds, paramMapping, continuous],
    );

    console.log('Create strategy');

    const receipt = await proxy['execute(address,bytes)'](strategyProxyAddr, functionData, {
        gasLimit: 5000000,
    });

    const gasUsed = await getGasUsed(receipt);
    const dollarPrice = calcGasToUSD(gasUsed, AVG_GAS_PRICE);

    console.log(`GasUsed createStrategy; ${gasUsed}, price at ${AVG_GAS_PRICE} gwei $${dollarPrice}`);
};

const createBundle = async (proxy, strategyIds) => {
    const strategyProxyAddr = await getAddrFromRegistry('StrategyProxy');

    const StrategyProxy = await hre.ethers.getContractFactory('StrategyProxy');

    const functionData = StrategyProxy.interface.encodeFunctionData(
        'createBundle',
        [strategyIds],
    );

    const receipt = await proxy['execute(address,bytes)'](strategyProxyAddr, functionData, {
        gasLimit: 5000000,
    });

    const gasUsed = await getGasUsed(receipt);
    const dollarPrice = calcGasToUSD(gasUsed, AVG_GAS_PRICE);

    console.log(`GasUsed createBundle; ${gasUsed}, price at ${AVG_GAS_PRICE} gwei $${dollarPrice}`);
};

const subToStrategy = async (proxy, strategySub) => {
    const SubProxyAddr = await getAddrFromRegistry('SubProxy');

    const SubProxyProxy = await hre.ethers.getContractFactory('SubProxy');
    const functionData = SubProxyProxy.interface.encodeFunctionData(
        'subscribeToStrategy',
        [strategySub],
    );

    const receipt = await proxy['execute(address,bytes)'](SubProxyAddr, functionData, {
        gasLimit: 5000000,
    });

    const gasUsed = await getGasUsed(receipt);
    const dollarPrice = calcGasToUSD(gasUsed, AVG_GAS_PRICE);
    console.log(`GasUsed subToStrategy; ${gasUsed}, price at ${AVG_GAS_PRICE} gwei $${dollarPrice}`);

    const latestStrategyId = await getLatestSubId();

    return latestStrategyId;
};

const addBotCaller = async (botAddr) => {
    await impersonateAccount(OWNER_ACC);

    const signer = await hre.ethers.provider.getSigner(OWNER_ACC);
    const botAuthAddr = await getAddrFromRegistry('BotAuth');

    const botAuthInstance = await hre.ethers.getContractFactory('BotAuth', signer);
    let botAuth = await botAuthInstance.attach(botAuthAddr);

    botAuth = botAuth.connect(signer);

    await botAuth.addCaller(botAddr);

    await stopImpersonatingAccount(OWNER_ACC);
};

const setMCDPriceVerifier = async (triggerAddr) => {
    const oldOwner = '0x0528A32fda5beDf89Ba9ad67296db83c9452F28C';
    await impersonateAccount(oldOwner);

    const signer = await hre.ethers.provider.getSigner(oldOwner);

    let mcdPriceVerifier = await hre.ethers.getContractAt('IMCDPriceVerifier', '0xeAa474cbFFA87Ae0F1a6f68a3aBA6C77C656F72c');

    mcdPriceVerifier = mcdPriceVerifier.connect(signer);

    await mcdPriceVerifier.setAuthorized(triggerAddr, true);

    await stopImpersonatingAccount(oldOwner);
};

module.exports = {
    subToStrategy,
    createStrategy,
    createBundle,
    getLatestStrategyId,
    getLatestSubId,
    addBotCaller,
    setMCDPriceVerifier,
};
