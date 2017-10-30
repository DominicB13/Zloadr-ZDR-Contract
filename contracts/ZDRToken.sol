pragma solidity ^0.4.15;


import './zeppelin/token/MintableToken.sol';
import './zeppelin/ownership/HasNoContracts.sol';
import './zeppelin/ownership/HasNoTokens.sol';

contract ZDRToken is MintableToken, HasNoContracts, HasNoTokens { //MintableToken is StandardToken, Ownable
    string public symbol = 'ZDR';
    string public name = 'Zloadr Token';
    uint8 public constant decimals = 8;

    /**
     * Allow transfer only after crowdsale finished
     */
    modifier canTransfer() {
        require(mintingFinished);
        _;
    }
    
    function transfer(address _to, uint256 _value) canTransfer returns (bool) {
        super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint256 _value) canTransfer returns (bool) {
        super.transferFrom(_from, _to, _value);
    }
}

