// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "../../auth/AdminAuth.sol";
import "../../auth/ProxyPermission.sol";
import "../../DS/DSGuard.sol";
import "../../DS/DSAuth.sol";
import "./Subscriptions.sol";
import "../DFSRegistry.sol";
import "hardhat/console.sol";

/// @title Handles auth and calls subscription contract
contract SubscriptionProxy is StrategyData, AdminAuth, ProxyPermission {

    address public constant REGISTRY_ADDR = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    DFSRegistry public constant registry = DFSRegistry(REGISTRY_ADDR);

    bytes4 constant PROXY_AUTH_ID = bytes4(keccak256("ProxyAuth"));
    bytes4 constant SUBSCRIPTION_ID = bytes4(keccak256("Subscriptions"));

    function createStrategy(
        uint64 _templateId,
        bool _active,
        bytes[] memory _subData,
        bytes[] memory _triggerData
    ) public {
        address proxyAuthAddr = registry.getAddr(PROXY_AUTH_ID);
        address subAddr = registry.getAddr(SUBSCRIPTION_ID);

        givePermission(proxyAuthAddr);

        Subscriptions(subAddr).createStrategy(_templateId, _active, _subData, _triggerData);
    }

    function createTemplate(
        string memory _name,
        bytes4[] memory _triggerIds,
        bytes4[] memory _actionIds,
        uint8[][] memory _paramMapping
    ) public {
        console.logBytes4(SUBSCRIPTION_ID);
        console.logBytes32(keccak256("Subscriptions"));

        address subAddr = registry.getAddr(SUBSCRIPTION_ID);
        console.log(subAddr);

        Subscriptions(subAddr).createTemplate(_name, _triggerIds, _actionIds, _paramMapping);
    }

    function createTemplateAndStrategy(
        string memory _name,
        bytes4[] memory _triggerIds,
        bytes4[] memory _actionIds,
        uint8[][] memory _paramMapping,
        bool _active,
        bytes[] memory _subData,
        bytes[] memory _triggerData
    ) public {
        address proxyAuthAddr = registry.getAddr(PROXY_AUTH_ID);
        address subAddr = registry.getAddr(SUBSCRIPTION_ID);

        givePermission(proxyAuthAddr);

        uint64 templateId = 
            Subscriptions(subAddr).createTemplate(_name, _triggerIds, _actionIds, _paramMapping);

        Subscriptions(subAddr).createStrategy(templateId, _active, _subData, _triggerData);
    }

    function updateStrategy(
        uint _strategyId,
        uint64 _templateId,
        bool _active,
        bytes[] memory _subData,
        bytes[] memory _triggerData
    ) public {
        address subAddr = registry.getAddr(SUBSCRIPTION_ID);

        Subscriptions(subAddr).updateStrategy(_strategyId, _templateId, _active, _subData, _triggerData);
    }

    function unsubscribeStrategy(uint256 _strategyId) public {
        address subAddr = registry.getAddr(SUBSCRIPTION_ID);

        Subscriptions(subAddr).removeStrategy(_strategyId);

        if (!Subscriptions(subAddr).userHasStrategies(address(this))) {
            address proxyAuthAddr = registry.getAddr(PROXY_AUTH_ID);
            removePermission(proxyAuthAddr);
        }
    }
}
