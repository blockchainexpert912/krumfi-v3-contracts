/* eslint-disable max-len */
const { getAssetInfo } = require('@defisaver/tokens');
const { expect } = require('chai');
const hre = require('hardhat');
// const axios = require('axios');

const dfs = require('@defisaver/sdk');

const defisaverSdk = require('@defisaver/sdk');
const { default: axios } = require('axios');
const {
    getProxy,
    redeploy,
    balanceOf,
    setNewExchangeWrapper,
    setBalance,
    resetForkToBlock,
    Float2BN,
    curveApiInit,
    formatExchangeObj,
    BN2Float,
    formatExchangeObjCurve,
    REGISTRY_ADDR,
    addrs,
    placeHolderAddr,
    getAddrFromRegistry,
    approve,
    formatExchangeObjForOffchain,
    addToZRXAllowlist,
    chainIds,
} = require('../utils');

const {
    sell, executeAction,
} = require('../actions');

const trades = [
    {
        sellToken: 'WETH', buyToken: 'DAI', amount: '1', fee: 3000,
    },
    {
        sellToken: 'DAI', buyToken: 'WBTC', amount: '30000', fee: 3000,
    },
    {
        sellToken: 'WETH', buyToken: 'USDC', amount: '1', fee: 3000,
    },
    {
        sellToken: 'USDC', buyToken: 'WETH', amount: '3000', fee: 3000,
    },
    {
        sellToken: 'WETH', buyToken: 'USDT', amount: '1', fee: 3000,
    },
    {
        sellToken: 'DAI', buyToken: 'USDC', amount: '3000', fee: 500,
    },
];

const curveTrades = [
    {
        sellToken: 'WETH', buyToken: 'LUSD', amount: '1',
    },
    {
        sellToken: 'LUSD', buyToken: 'WETH', amount: '3000',
    },
    {
        sellToken: 'WETH', buyToken: 'STETH', amount: '1',
    },
    {
        sellToken: 'STETH', buyToken: 'WETH', amount: '1',
    },
];

const executeSell = async (senderAcc, proxy, dfsPrices, trade, wrapper, isCurve = false) => {
    const sellAssetInfo = getAssetInfo(trade.sellToken);
    const buyAssetInfo = getAssetInfo(trade.buyToken);

    const amount = Float2BN(trade.amount, getAssetInfo(trade.sellToken).decimals);

    await setBalance(buyAssetInfo.address, senderAcc.address, Float2BN('0'));
    await setBalance(sellAssetInfo.address, senderAcc.address, amount);

    let exchangeObject;
    if (!isCurve) {
        exchangeObject = formatExchangeObj(
            sellAssetInfo.address,
            buyAssetInfo.address,
            amount,
            wrapper.address,
            0,
            trade.fee,
        );
    } else {
        exchangeObject = await formatExchangeObjCurve(
            sellAssetInfo.address,
            buyAssetInfo.address,
            amount,
            wrapper.address,
        );
    }
    const exchangeData = exchangeObject.at(-2);

    // eslint-disable-next-line no-unused-vars
    const rate = await dfsPrices.callStatic.getExpectedRate(
        wrapper.address,
        sellAssetInfo.address,
        buyAssetInfo.address,
        amount,
        0, // exchangeType = SELL
        exchangeData,
    );
    const expectedOutput = +BN2Float(rate) * trade.amount;

    const feeReceiverAmountBefore = await balanceOf(sellAssetInfo.address,
        addrs[hre.network.config.name].FEE_RECEIVER);

    await sell(
        proxy,
        sellAssetInfo.address,
        buyAssetInfo.address,
        amount,
        wrapper.address,
        senderAcc.address,
        senderAcc.address,
        trade.fee,
        senderAcc,
        REGISTRY_ADDR,
        isCurve,
    );

    const feeReceiverAmountAfter = await balanceOf(sellAssetInfo.address,
        addrs[hre.network.config.name].FEE_RECEIVER);
    const buyBalanceAfter = await balanceOf(buyAssetInfo.address, senderAcc.address);

    // test fee amount
    const tokenGroupRegistry = await hre.ethers.getContractAt('TokenGroupRegistry',
        addrs[hre.network.config.name].TOKEN_GROUP_REGISTRY);

    const fee = await tokenGroupRegistry.getFeeForTokens(sellAssetInfo.address, buyAssetInfo.address);

    const feeAmount = amount.div(fee);

    // must be closeTo because 1 wei steth bug
    expect(feeReceiverAmountAfter).to.be.closeTo(feeReceiverAmountBefore.add(feeAmount), '1');

    expect(buyBalanceAfter).is.gt('0');
    if (Math.abs(
        +BN2Float(buyBalanceAfter, buyAssetInfo.decimals) - expectedOutput,
    ) > expectedOutput * 0.01) {
        console.log(`
        Bad liquidity or rate getter:
        Expected: ${expectedOutput}
        Output: ${+BN2Float(buyBalanceAfter, buyAssetInfo.decimals)}
        `);
    }
    return rate;
};

const dfsSellSameAssetTest = async () => {
    describe('Dfs-same asset sell', function () {
        this.timeout(140000);

        let senderAcc;
        let proxy;
        let recipeExecutorAddr;

        const network = hre.network.config.name;

        before(async () => {
            await redeploy('DFSSell');
            await redeploy('RecipeExecutor');
            senderAcc = (await hre.ethers.getSigners())[0];
            proxy = await getProxy(senderAcc.address);
            recipeExecutorAddr = await getAddrFromRegistry('RecipeExecutor');
        });

        it('... should try to test how same asset swap works', async () => {
            const amount = hre.ethers.utils.parseUnits('100', 18);
            const daiAddr = addrs[network].DAI_ADDRESS;
            const pullTokenAction = new dfs.actions.basic.PullTokenAction(
                daiAddr,
                senderAcc.address,
                amount.toString(),
            );
            const dfsSellAction = new dfs.actions.basic.SellAction(
                formatExchangeObj(
                    daiAddr,
                    daiAddr,
                    amount.toString(),
                    placeHolderAddr,
                ),
                proxy.address,
                proxy.address,
            );
            const sendTokenAction = new dfs.actions.basic.SendTokenAction(
                daiAddr,
                senderAcc.address,
                '$2',
            );
            const dfsSellSameAssetRecipe = new dfs.Recipe('SameAssetSell', [
                pullTokenAction,
                dfsSellAction,
                sendTokenAction,
            ]);

            await setBalance(daiAddr, senderAcc.address, amount);
            await approve(daiAddr, proxy.address);
            const functionData = dfsSellSameAssetRecipe.encodeForDsProxyCall();
            await proxy['execute(address,bytes)'](recipeExecutorAddr, functionData[1], {
                gasLimit: 3000000,
            });
            const daiBalanceAfter = await balanceOf(daiAddr, senderAcc.address);
            expect(daiBalanceAfter).to.be.eq(amount);
        });
    });
};

const dfsSellTest = async () => {
    describe('Dfs-Sell', function () {
        this.timeout(400000);

        let senderAcc;
        let proxy;
        let uniWrapper;
        let kyberWrapper;
        let uniV3Wrapper;
        let paraswapWrapper;
        let curveWrapper;
        let dfsPrices;
        let kyberAggregatorWrapper;

        before(async () => {
            // await curveApiInit();
            // await resetForkToBlock();
            await redeploy('DFSSell');
            /*
            dfsPrices = await redeploy('DFSPrices');
            uniWrapper = await redeploy('UniswapWrapperV3');
            kyberWrapper = await redeploy('KyberWrapperV3');
            uniV3Wrapper = await redeploy('UniV3WrapperV3');
            curveWrapper = await redeploy('CurveWrapperV3');
            paraswapWrapper = await redeploy('ParaswapWrapper');
            */
            kyberAggregatorWrapper = await redeploy('KyberAggregatorWrapper');

            senderAcc = (await hre.ethers.getSigners())[0];
            proxy = await getProxy(senderAcc.address);
            /*
            await setNewExchangeWrapper(senderAcc, uniWrapper.address);
            await setNewExchangeWrapper(senderAcc, kyberWrapper.address);
            await setNewExchangeWrapper(senderAcc, uniV3Wrapper.address);
            await setNewExchangeWrapper(senderAcc, curveWrapper.address);

            await setNewExchangeWrapper(senderAcc, paraswapWrapper.address);
            */
            await setNewExchangeWrapper(senderAcc, kyberAggregatorWrapper.address);
        });

        it('... should try to sell WETH for DAI with offchain calldata (Kyber)', async () => {
            const network = hre.network.config.name;
            const chainId = chainIds[network];
            const sellAssetInfo = getAssetInfo('WETH', chainId);
            const buyAssetInfo = getAssetInfo('USDC', chainId);

            const buyBalanceBefore = await balanceOf(buyAssetInfo.address, senderAcc.address);
            const amount = hre.ethers.utils.parseUnits('1', 18);

            await setBalance(sellAssetInfo.address, senderAcc.address, amount);
            await approve(sellAssetInfo.address, proxy.address);
            let baseUrl = '';
            if (chainId === 1) {
                baseUrl = 'https://aggregator-api.kyberswap.com/ethereum/api/v1/';
            }
            if (chainId === 10) {
                baseUrl = 'https://aggregator-api.kyberswap.com/optimism/api/v1/';
            }
            const options = {
                method: 'GET',
                baseURL: baseUrl,
                url: `routes?tokenIn=${sellAssetInfo.address}&tokenOut=${buyAssetInfo.address}&amountIn=${amount.toString()}&saveGas=false&gasInclude=true`,
            };
            console.log(options.baseURL + options.url);
            const priceObject = await axios(options).then((response) => response.data.data);
            console.log(priceObject);
            const secondOptions = {
                method: 'POST',
                baseURL: baseUrl,
                url: 'route/build',
                data: {
                    routeSummary: priceObject.routeSummary,
                    sender: kyberAggregatorWrapper.address,
                    recipient: kyberAggregatorWrapper.address,
                    slippageTolerance: 1000,
                    deadline: 1776079017,
                },
            };
            // console.log(secondOptions.data);
            const resultObject = await axios(secondOptions).then((response) => response.data);

            // console.log(resultObject);
            // THIS IS CHANGEABLE WITH API INFORMATION
            const allowanceTarget = priceObject.routerAddress;
            const price = 1; // just for testing, anything bigger than 0 triggers offchain if
            const protocolFee = 0;
            const callData = resultObject.data.data;
            const kyberSpecialCalldata = hre.ethers.utils.defaultAbiCoder.encode(['(bytes4,bytes)'], [[callData.substring(0, 10), `0x${callData.substring(10)}`]]);

            const exchangeObject = formatExchangeObjForOffchain(
                sellAssetInfo.address,
                buyAssetInfo.address,
                hre.ethers.utils.parseUnits('1', 18),
                kyberAggregatorWrapper.address,
                priceObject.routerAddress,
                allowanceTarget,
                price,
                protocolFee,
                kyberSpecialCalldata,
            );

            await addToZRXAllowlist(senderAcc, priceObject.routerAddress);
            const sellAction = new dfs.actions.basic.SellAction(
                exchangeObject, senderAcc.address, senderAcc.address,
            );

            const functionData = sellAction.encodeForDsProxyCall()[1];

            await executeAction('DFSSell', functionData, proxy);

            const buyBalanceAfter = await balanceOf(buyAssetInfo.address, senderAcc.address);
            expect(buyBalanceBefore).is.lt(buyBalanceAfter);
        });
        /*
        for (let i = 0; i < trades.length; ++i) {
            const trade = trades[i];

            it(`... should sell ${trade.sellToken} for ${trade.buyToken}`, async () => {
                const kyberRate = await executeSell(senderAcc, proxy, dfsPrices, trade, kyberWrapper);
                console.log(`Kyber sell rate -> ${kyberRate}`);

                const uniRate = await executeSell(
                    senderAcc, proxy, dfsPrices,
                    { ...trade, fee: 0 },
                    uniWrapper,
                );
                console.log(`Uniswap sell rate -> ${uniRate}`);

                const uniV3Rate = await executeSell(senderAcc, proxy, dfsPrices, trade, uniV3Wrapper);
                console.log(`UniswapV3 sell rate -> ${uniV3Rate}`);

                const curveRate = await executeSell(
                    senderAcc,
                    proxy,
                    dfsPrices,
                    trade,
                    curveWrapper,
                    true,
                );
                console.log(`Curve sell rate -> ${curveRate}`);
            });
        }

        for (let i = 0; i < curveTrades.length; ++i) {
            const trade = curveTrades[i];

            it(`... should sell ${trade.sellToken} for ${trade.buyToken} on Curve`, async () => {
                const curveRate = await executeSell(
                    senderAcc,
                    proxy,
                    dfsPrices,
                    trade,
                    curveWrapper,
                    true,
                );
                console.log(`Curve sell rate -> ${curveRate}`);
            });
        }
        */
    });
};

const dfsExchangeFullTest = async () => {
    dfsSellTest();
};

module.exports = {
    dfsExchangeFullTest,
    dfsSellSameAssetTest,
    dfsSellTest,
};
