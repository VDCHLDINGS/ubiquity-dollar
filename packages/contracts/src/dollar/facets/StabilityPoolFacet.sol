// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IStabilityPool {
    function provideToSP(uint256 _amount, address _frontEndTag) external;
    function withdrawFromSP(uint256 _amount) external;
    function getCompoundedLUSDDeposit(address _depositor) external view returns (uint256);
    function getDepositorETHGain(address _depositor) external view returns (uint256);
    function getDepositorLQTYGain(address _depositor) external view returns (uint256);
}

/**
 * @title StabilityPoolFacet
 * @notice ubiquity/ubiquity-dollar#997 ($1,200): Integrate Liquity V1 Stability Pool for LUSD Collateral Yield
 */
contract StabilityPoolFacet {
    address public constant LIQUITY_STABILITY_POOL = 0x66017D22b0f8556afDd19e1e5b5f1cbD89a6C337;

    bytes32 internal constant STABILITY_POOL_STORAGE_POSITION =
        keccak256("ubiquity.contracts.stability.pool.storage");

    struct StabilityPoolStorage {
        uint256 totalPrincipalInPool;
        address protocolTreasury;
        uint256 totalCompoundedLusd;
        uint256 totalGovernanceBuybackValue;
    }

    event DepositedToStabilityPool(uint256 amount, uint256 totalPrincipalInPool);
    event WithdrawnFromStabilityPool(uint256 amount, uint256 totalPrincipalInPool);
    event RewardsHarvested(uint256 ethGain, uint256 lqtyGain, uint256 compoundedLusdShare, uint256 buybackShare);

    function stabilityPoolStorage() internal pure returns (StabilityPoolStorage storage ds) {
        bytes32 position = STABILITY_POOL_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    function depositToPool(uint256 amount) external {
        require(amount > 0, "StabilityPool: zero deposit");
        StabilityPoolStorage storage ds = stabilityPoolStorage();
        ds.totalPrincipalInPool += amount;
        IStabilityPool(LIQUITY_STABILITY_POOL).provideToSP(amount, address(0));
        emit DepositedToStabilityPool(amount, ds.totalPrincipalInPool);
    }

    function withdrawFromPool(uint256 amount) external {
        StabilityPoolStorage storage ds = stabilityPoolStorage();
        require(amount > 0 && amount <= ds.totalPrincipalInPool, "StabilityPool: insufficient principal");
        ds.totalPrincipalInPool -= amount;
        IStabilityPool(LIQUITY_STABILITY_POOL).withdrawFromSP(amount);
        emit WithdrawnFromStabilityPool(amount, ds.totalPrincipalInPool);
    }
}
