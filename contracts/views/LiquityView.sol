// SPDX-License-Identifier: MIT

pragma solidity =0.8.10;

import "../utils/TokenUtils.sol";
import "../actions/liquity/helpers/LiquityHelper.sol";
import "../utils/SafeMath.sol";

contract LiquityView is LiquityHelper {
    using TokenUtils for address;
    using SafeMath for uint256;

    enum CollChange { SUPPLY, WITHDRAW }
    enum DebtChange { PAYBACK, BORROW }

    function isRecoveryMode() public view returns (bool) {
        uint256 price = PriceFeed.lastGoodPrice();
        return TroveManager.checkRecoveryMode(price);
    }

    function computeNICR(uint256 _coll, uint256 _debt) public pure returns (uint256) {
        if (_debt > 0) {
            return _coll.mul(1e20).div(_debt);
        }
        // Return the maximal value for uint256 if the Trove has a debt of 0. Represents "infinite" CR.
        else {
            // if (_debt == 0)
            return 2**256 - 1;
        }
    }

    function predictNICRForAdjust(
        address _troveOwner,
        CollChange collChangeAction,
        DebtChange debtChangeAction,
        address _from,
        uint256 _collAmount,
        uint256 _lusdAmount
    ) external view returns (uint256 NICR) {

        (uint256 debt, uint256 coll, , ) = TroveManager.getEntireDebtAndColl(_troveOwner);
        uint256 wholeDebt = TroveManager.getTroveDebt(_troveOwner);

        uint256 newColl;
        uint256 newDebt;

        //  LiquitySupply
        if (collChangeAction == CollChange.SUPPLY) {
            if (_collAmount == type(uint256).max)
                _collAmount = TokenUtils.WETH_ADDR.getBalance(_from);

            newColl = coll.add(_collAmount);
        }

        //  LiquityWithdraw
        if (collChangeAction == CollChange.WITHDRAW) {
            newColl = coll.sub(_collAmount);
        }
              
        //  LiquityBorrow
        if (debtChangeAction == DebtChange.BORROW) {
            if (!isRecoveryMode())
                _lusdAmount = _lusdAmount.add(TroveManager.getBorrowingFeeWithDecay(_lusdAmount));

            newDebt = debt.add(_lusdAmount);
        }

        //  LiquityPayback
        if (debtChangeAction == DebtChange.PAYBACK) {
            if (_lusdAmount == type(uint256).max) {
                _lusdAmount = LUSD_TOKEN_ADDRESS.getBalance(_from);
            }

            // can't close with payback, pull amount to payback to MIN_DEBT
            if (wholeDebt < (_lusdAmount + MIN_DEBT)) {
                _lusdAmount = wholeDebt - MIN_DEBT;
            }

            newDebt = debt.sub(_lusdAmount);
        }
        return computeNICR(newColl, newDebt);
    }

    function getApproxHint(
        uint256 _CR,
        uint256 _numTrials,
        uint256 _inputRandomSeed
    )
        external
        view
        returns (
            address hintAddress,
            uint256 diff,
            uint256 latestRandomSeed
        )
    {
        return HintHelpers.getApproxHint(_CR, _numTrials, _inputRandomSeed);
    }

    function findInsertPosition(
        uint256 _ICR,
        address _prevId,
        address _nextId
    ) external view returns (address upperHint, address lowerHint) {
        return SortedTroves.findInsertPosition(_ICR, _prevId, _nextId);
    }

    function getTroveInfo(address _troveOwner)
        external
        view
        returns (
            uint256 troveStatus,
            uint256 collAmount,
            uint256 debtAmount,
            uint256 collPrice,
            uint256 TCRatio,
            uint256 borrowingFeeWithDecay,
            bool recoveryMode
        )
    {
        troveStatus = TroveManager.getTroveStatus(_troveOwner);
        collAmount = TroveManager.getTroveColl(_troveOwner);
        debtAmount = TroveManager.getTroveDebt(_troveOwner);
        collPrice = PriceFeed.lastGoodPrice();
        TCRatio = TroveManager.getTCR(collPrice);
        borrowingFeeWithDecay = TroveManager.getBorrowingRateWithDecay();
        recoveryMode = TroveManager.checkRecoveryMode(collPrice);
    }

    function getInsertPosition(
        uint256 _collAmount,
        uint256 _debtAmount,
        uint256 _numTrials,
        uint256 _inputRandomSeed
    ) external view returns (address upperHint, address lowerHint) {
        uint256 NICR = _collAmount.mul(1e20).div(_debtAmount);
        (address hintAddress, , ) = HintHelpers.getApproxHint(NICR, _numTrials, _inputRandomSeed);
        (upperHint, lowerHint) = SortedTroves.findInsertPosition(NICR, hintAddress, hintAddress);
    }

    function getInsertPositionForTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        uint256 _numTrials,
        uint256 _inputRandomSeed,
        address _troveOwner
    ) external view returns (address upperHint, address lowerHint) {
        uint256 NICR = _collAmount.mul(1e20).div(_debtAmount);
        (address hintAddress, , ) = HintHelpers.getApproxHint(NICR, _numTrials, _inputRandomSeed);
        (upperHint, lowerHint) = SortedTroves.findInsertPosition(NICR, hintAddress, hintAddress);

        if (upperHint == _troveOwner) upperHint = SortedTroves.getPrev(_troveOwner);
        if (lowerHint == _troveOwner) lowerHint = SortedTroves.getNext(_troveOwner);
    }

    function getRedemptionHints(
        uint _LUSDamount, 
        uint _price,
        uint _maxIterations
    )
        external
        view
        returns (
        address firstRedemptionHint,
        uint partialRedemptionHintNICR,
        uint truncatedLUSDamount
    ) {
        return HintHelpers.getRedemptionHints(_LUSDamount, _price, _maxIterations);
    }
    
    function getStakeInfo(address _user) external view returns (uint256 stake, uint256 ethGain, uint256 lusdGain) {
        stake = LQTYStaking.stakes(_user);
        ethGain = LQTYStaking.getPendingETHGain(_user);
        lusdGain = LQTYStaking.getPendingLUSDGain(_user);
    }
    
    function getDepositorInfo(address _depositor) external view returns(uint256 compoundedLUSD, uint256 ethGain, uint256 lqtyGain) {
        compoundedLUSD = StabilityPool.getCompoundedLUSDDeposit(_depositor);
        ethGain = StabilityPool.getDepositorETHGain(_depositor);
        lqtyGain = StabilityPool.getDepositorLQTYGain(_depositor);
    }

    /// @notice Returns the debt in front of the users trove in the sorted list
    /// @param _of Address of the trove owner
    /// @param _acc Accumulated sum used in subsequent calls, 0 for first call
    /// @param _iterations Maximum number of troves to traverse
    /// @return next Trove owner address to be used in the subsequent call, address(0) at the end of list
    /// @return debt Accumulated debt to be used in the subsequent call
    function getDebtInFront(address _of, uint256 _acc, uint256 _iterations) external view returns (address next, uint256 debt) {
        next = _of;
        debt = _acc;
        for (uint256 i = 0; i < _iterations && next != address(0); i++) {
            next = SortedTroves.getNext(next);
            debt = debt.add(TroveManager.getTroveDebt(next));
        }
    }
}
