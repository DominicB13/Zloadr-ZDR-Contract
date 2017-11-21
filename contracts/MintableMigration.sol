pragma solidity ^0.4.15;


import './zeppelin/token/ERC20Basic.sol';
import './zeppelin/ownership/Ownable.sol';
import './ZDRToken.sol';

contract MintableMigration is Ownable {

    ZDRToken public token;

    function MintableMigration() public{
        token = new ZDRToken();
    }

    function migrate(ERC20Basic from, address[] who) onlyOwner public {
        for(uint256 i=0; i < who.length; i++){
            uint256 balance = from.balanceOf(who[i]);
            if(balance != 0){
                assert(token.mint(who[i], balance));    
            }
        }
    }

    function transferTokenOwnership() onlyOwner public {
        token.transferOwnership(owner);
    }

}