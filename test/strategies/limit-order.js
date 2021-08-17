const hre = require('hardhat');
const { expect } = require('chai');

const dfs = require('@defisaver/sdk');

const {
    getProxy,
    redeploy,
    formatExchangeObj,
    getChainLinkPrice,
    depositToWeth,
    approve,
    balanceOf,
    ETH_ADDR,
    WETH_ADDRESS,
    DAI_ADDR,
    nullAddress,
} = require('../utils');

const { subLimitOrderStrategy, callLimitOrderStrategy } = require('../strategies');

const { createStrategy, addBotCaller } = require('../utils-strategies.js');

describe('Limit-Order-Strategy', function () {
    this.timeout(120000);

    let senderAcc;
    let proxy;
    let botAcc;
    let strategyExecutor;
    let subId;
    let amount;

    before(async () => {
        senderAcc = (await hre.ethers.getSigners())[0];
        botAcc = (await hre.ethers.getSigners())[1];

        await redeploy('BotAuth');
        await redeploy('ProxyAuth');
        await redeploy('StrategyStorage');
        await redeploy('SubStorage');
        await redeploy('RecipeExecutor');
        await redeploy('GasFeeTaker');
        await redeploy('DFSSell');
        await redeploy('ChainLinkPriceTrigger');
        await redeploy('SubProxy');
        await redeploy('StrategyProxy');
        await redeploy('PullToken');
        strategyExecutor = await redeploy('StrategyExecutor');

        await addBotCaller(botAcc.address);

        proxy = await getProxy(senderAcc.address);
    });

    it('... should make a new Limit order strategy', async () => {
        const limitOrderStrategy = new dfs.Strategy('LimitOrderStrategy');
        limitOrderStrategy.addSubSlot('&tokenAddrSell', 'address');
        limitOrderStrategy.addSubSlot('&tokenAddrBuy', 'address');
        limitOrderStrategy.addSubSlot('&amount', 'uint256');
        limitOrderStrategy.addSubSlot('&proxy', 'address');
        limitOrderStrategy.addSubSlot('&eoa', 'address');

        const chainLinkPriceTrigger = new dfs.triggers.ChainLinkPriceTrigger(nullAddress, '0', '0');
        limitOrderStrategy.addTrigger(chainLinkPriceTrigger);

        const pullTokenAction = new dfs.actions.basic.PullTokenAction(
            WETH_ADDRESS, '&eoa', '&amount',
        );

        const feeTakingAction = new dfs.actions.basic.GasFeeAction(
            '0', '%wethAddr', '$1',
        );

        const sellAction = new dfs.actions.basic.SellAction(
            formatExchangeObj(
                '&tokenAddrSell',
                '&tokenAddrBuy',
                '$2',
                '%exchangeWrapper',
            ),
            '&proxy',
            '&eoa',
        );

        limitOrderStrategy.addAction(pullTokenAction);
        limitOrderStrategy.addAction(feeTakingAction);
        limitOrderStrategy.addAction(sellAction);

        const callData = limitOrderStrategy.encodeForDsProxyCall();

        await createStrategy(proxy, ...callData, false);

        const currPrice = await getChainLinkPrice(ETH_ADDR);

        const targetPrice = currPrice - 100; // Target is smaller so we can execute it

        const tokenAddrSell = WETH_ADDRESS;
        const tokenAddrBuy = DAI_ADDR;

        amount = hre.ethers.utils.parseUnits('1', 18); // Sell 1 eth

        subId = await subLimitOrderStrategy(
            proxy,
            senderAcc,
            tokenAddrSell,
            tokenAddrBuy,
            amount,
            targetPrice,
        );
    });

    it('... should trigger a limit order strategy', async () => {
        // get weth and approve dsproxy to pull
        await depositToWeth(amount.toString());
        await approve(WETH_ADDRESS, proxy.address);

        const daiBalanceBefore = await balanceOf(DAI_ADDR, senderAcc.address);
        const wethBalanceBefore = await balanceOf(WETH_ADDRESS, senderAcc.address);

        await callLimitOrderStrategy(botAcc, senderAcc, strategyExecutor, subId);

        const daiBalanceAfter = await balanceOf(DAI_ADDR, senderAcc.address);
        const wethBalanceAfter = await balanceOf(WETH_ADDRESS, senderAcc.address);

        expect(daiBalanceAfter).to.be.gt(daiBalanceBefore);
        expect(wethBalanceBefore).to.be.gt(wethBalanceAfter);
    });

    it('... should fail to trigger the same strategy again as its one time', async () => {
        try {
            await depositToWeth(amount.toString());
            await callLimitOrderStrategy(botAcc, senderAcc, strategyExecutor, subId);
        } catch (err) {
            expect(err.toString()).to.have.string('SubNotActiveError');
        }
    });
});
