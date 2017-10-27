pragma solidity ^0.4.15;


import './zeppelin/token/ERC20Basic.sol';

contract MultisigWallet {

    address[] public owners;
    
    struct EtherProposal {
        address to;
        uint256 amount;
        address[] approvedBy;
        bool executed;
    }
    struct TokenProposal {
        address token;
        address to;
        uint256 amount;
        address[] approvedBy;
        bool executed;
    }

    EtherProposal[] etherProposals;
    TokenProposal[] tokenProposals;

    function MultisigWallet(address[] _owners) {
        require(_owners.length > 0 && _owners.length < 255);
        owners = _owners;
    }

    function () payable {} //allow to receive ether

    // /**
    // * @notice Create proposal to send Ether
    // * 
    // */
    // function createEtherProposal(address _to, uint256 _amount) public returns(uint) {
    //     uint8 oidx = uint8(findOwner(msg.sender));
    //     require(oidx >= 0); //only allow owners to create proposals
    //     EtherProposal storage p = EtherProposal(_to, _amount, [], false);
    //     p.approvedBy.push(msg.sender);
    //     return etherProposals.push(p);
    // }

    // /**
    // * @dev searches for owner and returns his index in owners array
    // * @param whom to search
    // * @return -1 if not found, index overwise
    // */
    // function findOwner(address who) public constant returns(int16){
    //     for(uint8 i=0; i < owners.length; i++){
    //         if(owners[i] == who) return i;
    //     }
    //     return -1;
    // }

}