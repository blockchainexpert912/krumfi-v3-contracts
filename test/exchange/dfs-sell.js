const { expect } = require("chai");

const { getAssetInfo } = require('@defisaver/tokens');
const dfs = require('@defisaver/sdk')


const {
    getAddrFromRegistry,
    getProxy,
    redeploy,
    send,
    approve,
    balanceOf,
    formatExchangeObj,
    nullAddress,
    REGISTRY_ADDR,
    UNISWAP_WRAPPER,
    KYBER_WRAPPER,
    WETH_ADDRESS,
    isEth
} = require('../utils');

const {
    sell,
} = require('../actions.js');


// TODO: check stuff like price and slippage
// TODO: can we make it work with 0x?

describe("Dfs-Sell", function() {
    this.timeout(40000);

    let senderAcc, proxy, dfsSellAddr;

    const trades = [
        {sellToken: "WETH", buyToken: "DAI", amount: "1"},
        {sellToken: "DAI", buyToken: "WBTC", amount: "200"},
        {sellToken: "WETH", buyToken: "USDC", amount: "1"},
        {sellToken: "USDC", buyToken: "WETH", amount: "100"},
        {sellToken: "WETH", buyToken: "USDT", amount: "1"},
        {sellToken: "USDT", buyToken: "BAT", amount: "150"},
    ];

    before(async () => {
        await redeploy('DFSSell');
        
        senderAcc = (await hre.ethers.getSigners())[0];
        proxy = await getProxy(senderAcc.address);

        dfsSellAddr = await getAddrFromRegistry('DFSSell');

    });

    for (let i = 3; i < 4; ++i) {
        const trade = trades[i];

        it(`... should sell ${trade.sellToken} for a ${trade.buyToken}`, async () => {

            const sellAssetInfo = getAssetInfo(trade.sellToken);
            const buyAssetInfo = getAssetInfo(trade.buyToken);

            const buyBalanceBefore = await balanceOf(buyAssetInfo.address, senderAcc.address);

            const amount = trade.amount * 10**getAssetInfo(trade.sellToken).decimals;

            await sell(proxy, sellAssetInfo.address, buyAssetInfo.address, amount, UNISWAP_WRAPPER, senderAcc.address, senderAcc.address);
           
            const buyBalanceAfter = await balanceOf(buyAssetInfo.address, senderAcc.address);

            expect(buyBalanceBefore).is.lt(buyBalanceAfter);
        });

    }

});