// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "../../interfaces/liquity/IBorrowerOperations.sol";
import "../ActionBase.sol";

contract LiquityBorrow is ActionBase {

    address constant _borrowerOperations = 0x24179CD81c9e782A4096035f7eC97fB8B783e007;

    /// @inheritdoc ActionBase
    function executeAction(
        bytes[] memory _callData,
        bytes[] memory _subData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues
    ) public payable virtual override returns (bytes32) {
        (uint256 _maxFeePercentage, uint256 _LUSDAmount, address _upperHint, address _lowerHint) = parseInputs(_callData);

        _maxFeePercentage = _parseParamUint(_maxFeePercentage, _paramMapping[0], _subData, _returnValues);
        _LUSDAmount = _parseParamUint(_LUSDAmount, _paramMapping[1], _subData, _returnValues);
        //_upperHint = _parseParamAddr(_upperHint, _paramMapping[2], _subData, _returnValues);
        //_lowerHint = _parseParamAddr(_lowerHint, _paramMapping[3], _subData, _returnValues);

        _liquityBorrow(_maxFeePercentage, _LUSDAmount, _upperHint, _lowerHint);
        return bytes32(0);
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes[] memory _callData) public virtual payable override {
        (uint256 _maxFeePercentage, uint256 _LUSDAmount, address _upperHint, address _lowerHint) = parseInputs(_callData);

        _liquityBorrow(_maxFeePercentage, _LUSDAmount, _upperHint, _lowerHint);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.STANDARD_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Withdraw LUSD tokens from a trove: mint new LUSD tokens to the owner, and increase the trove's debt accordingly
    function _liquityBorrow(uint256 _maxFeePercentage, uint256 _LUSDAmount, address _upperHint, address _lowerHint) internal returns (uint256 nothing) {
        IBorrowerOperations(_borrowerOperations).withdrawLUSD(_maxFeePercentage, _LUSDAmount, _upperHint, _lowerHint);

        logger.Log(
            address(this),
            msg.sender,
            "LiquityBorrow",
            abi.encode(0)
        );
    }

    function parseInputs(bytes[] memory _callData)
        internal
        pure
        returns (uint256 _maxFeePercentage, uint256 _LUSDAmount, address _upperHint, address _lowerHint)
    {
        _maxFeePercentage = abi.decode(_callData[0], (uint256));
        _LUSDAmount = abi.decode(_callData[1], (uint256));
        _upperHint = abi.decode(_callData[2], (address));
        _lowerHint = abi.decode(_callData[3], (address));
    }
}