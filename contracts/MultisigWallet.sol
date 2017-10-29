pragma solidity ^0.4.15;


import './zeppelin/token/ERC20Basic.sol';
import './zeppelin/token/SafeERC20.sol';

contract MultisigWallet {
    using SafeERC20 for ERC20Basic;

    enum ProposalType {Ether, TokenTransfer}

    struct Proposal {
        ProposalType proposalType;
        address to;
        ERC20Basic token;
        uint256 amount;
        uint8 approvalsCount;
        bool executed;
    }


    address[] public owners;
    uint8 public requiredApprovals;
    

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping (address => bool)) public approvals;

    modifier onlyOwner(){
        require(findOwner(msg.sender) >= 0);
        _;        
    }

    function MultisigWallet(address[] _owners, uint8 _requiredApprovals) {
        require(_owners.length > 0 && _owners.length < 255);
        require(_requiredApprovals <= _owners.length);
        owners = _owners;
        requiredApprovals = _requiredApprovals;
    }

    /**
    * @dev Fallback function allows to receive ether
    */
    function () payable {}
    /**
    * @dev Allow to receive ERC23 compatible tokens
    */
    function tokenFallback(address /*from_*/, uint256 /*value_*/, bytes /*data_*/) {}

    /**
    * @notice Create proposal to send Ether
    * 
    */
    function createProposal(ProposalType _type, address _to, ERC20Basic _token, uint256 _amount) onlyOwner public returns(uint256) {
        uint256 idx = proposalCount; 
        proposals[idx] = Proposal({
            proposalType: _type, 
            to: _to, 
            token: _token,
            amount: _amount,
            approvalsCount: 0,
            executed: false
        });
        proposalCount++;
        approvals[idx][msg.sender] = true;
        proposals[idx].approvalsCount++;
        return idx;
    }

    function approveProposal(uint256 idx) onlyOwner public {
        require(idx < proposalCount);
        Proposal storage p = proposals[idx];
        require(!p.executed);
        require(!approvals[idx][msg.sender]);
        approvals[idx][msg.sender] = true;
        p.approvalsCount++;
    }

    function executeProposal(uint256 idx) onlyOwner public {
        Proposal storage p = proposals[idx];
        assert(!p.executed);
        assert(p.approvalsCount >= requiredApprovals);
        p.executed = true;  //do it before send to prevent reentrance atack
        if(p.proposalType == ProposalType.Ether){
            require(p.amount <= this.balance);
            p.to.transfer(p.amount);    //this will throw if failed
        }else if(p.proposalType == ProposalType.TokenTransfer){
            p.token.safeTransfer(p.to, p.amount);
        }else{
            revert();
        }
    }


    /**
    * @dev searches for owner and returns his index in owners array
    * @param who to search
    * @return -1 if not found, index overwise
    */
    function findOwner(address who) private constant returns(int16){
        for(uint8 i=0; i < owners.length; i++){
            if(owners[i] == who) return i;
        }
        return -1;
    }

}