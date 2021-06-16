// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;
pragma abicoder v2; // solhint-disable-line

import "../auth/AdminAuth.sol";
import "../core/strategy/Subscriptions.sol";
import "../actions/mcd/helpers/McdRatioHelper.sol";
import "../interfaces/ITrigger.sol";

contract McdRatioTrigger is ITrigger, AdminAuth, McdRatioHelper {

    enum RatioState { OVER, UNDER }
    struct CallParams {
        uint256 nextPrice;
    }
    struct SubParams {
        uint256 vaultId;
        uint256 ratio;
        uint8 state;
    }

    function isTriggered(bytes memory _callData, bytes memory _subData)
        public
        view
        override
        returns (bool)
    {
        CallParams memory callInputData = parseCallInputs(_callData);
        SubParams memory subInputData = parseSubInputs(_subData);

        uint256 currRatio = getRatio(subInputData.vaultId, callInputData.nextPrice);

        if (RatioState(subInputData.state) == RatioState.OVER) {
            if (currRatio > subInputData.ratio) return true;
        }

        if (RatioState(subInputData.state) == RatioState.UNDER) {
            if (currRatio < subInputData.ratio) return true;
        }

        return false;
    }

    function parseSubInputs(bytes memory _callData) internal pure returns (SubParams memory params) {
        params = abi.decode(_callData, (SubParams));
    }

    function parseCallInputs(bytes memory _callData) internal pure returns (CallParams memory params) {
        params = abi.decode(_callData, (CallParams));
    }

}
