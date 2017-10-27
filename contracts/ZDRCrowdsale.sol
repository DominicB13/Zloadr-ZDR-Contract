pragma solidity ^0.4.15;


import './zeppelin/math/SafeMath.sol';
import './zeppelin/ownership/Ownable.sol';
import './ZDRToken.sol';

contract ZDRCrowdsale is Ownable {
    using SafeMath for uint256;    

    struct Round {
        uint256 start;      //Timestamp of crowdsale round start
        uint256 end;        //Timestamp of crowdsale round end
        uint256 rate;       //Rate: how much ZDR_units (ZDR_unit = 0.00000001 ZDR) one will get for 1 USD during this round
    }
    Round[] public rounds;  //Array of crowdsale rounds

    uint256 public maxGasPrice  = 50000000000 wei;      //Maximum gas price for contribution transactions

    address public controller;      //address of controller server which will set usdRate and issue tokens for money received in other currency
    address public beneficiary;     //address of multisig wallet which will hold funds;


    ZDRToken public token;
    uint256 public usdRate;           //price of 1 USD in Ethereum wei

    uint256 public collectedEther;    //how much ether was totally collected
    uint256 public collectedUSDCents; //how much USD_cents were collected (approximately)

    bool public finalized;

    /**
    * verifies that the gas price is lower than maxGasPrice
    */
    modifier validGasPrice() {
        require(tx.gasprice <= maxGasPrice);
        _;
    }
    /**
    * @dev Creates Crowdsale and token contracts
    * @param _controller address of the server which will issue tokens to non-ethereum buyers
    * @param _beneficiary address of MultiSig wallet
    * @param _ownersTokens how much tokens send to beneficiary (in ZDR_units (ZDR_unit = 0.00000001 ZDR))
    * @param _usdRate price of 1 USD in Ethereum wei
    * @param roundStarts timestamps of round starts
    * @param roundEnds timestamps of round ends
    * @param roundRates rates (how much ZDR_units one will get for 1 USD) for each round
    */
    function ZDRCrowdsale(address _controller, address _beneficiary, uint256 _ownersTokens, uint256 _usdRate, uint256[] roundStarts, uint256[] roundEnds, uint256[] roundRates){
        require(_controller != 0);
        controller = _controller;
        require(_beneficiary != 0);
        beneficiary = _beneficiary;
        require(_usdRate > 0);
        usdRate = _usdRate;

        require(
            (roundStarts.length > 0)  &&                //There should be at least one round
            (roundStarts.length == roundEnds.length) &&
            (roundStarts.length == roundRates.length)
        );                   
        uint256 prevRoundEnd = now;
        rounds.length = roundStarts.length;             //initialize rounds array
        for(uint8 i=0; i < roundStarts.length; i++){
            rounds[i] = Round(roundStarts[i], roundEnds[i], roundRates[i]);
            Round storage r = rounds[i];
            require(prevRoundEnd <= r.start);
            require(r.start < r.end);
            require(r.rate > 0);
            prevRoundEnd = rounds[i].end;
        }

        token = new ZDRToken();
        token.mint(beneficiary, _ownersTokens);
    }
    /**
    * @notice This is called when somebody send ether to teh contract to buy tokens
    */
    function () payable validGasPrice {
        require(msg.value > 0);
        require(!finalized);

        collectedEther = collectedEther.add(msg.value);
        collectedUSDCents = collectedUSDCents.add(msg.value.mul(100).div(usdRate));
        uint256 buyerTokens = weiToTokenUnits(msg.value);

        token.mint(msg.sender, buyerTokens);
        beneficiary.transfer(msg.value);
    }
    /**
    * @notice This should be called by controller server to send tokens to buyer (if purshased with non-ether currency)
    * @param to address of the buyer
    * @param amount of tokens to send in ZDR_units (ZDR_unit = 0.00000001 ZDR)
    */
    function issueTokens(address to, uint256 amount) public {
        require (msg.sender == controller);
        require(crowdsaleOpen());

        uint256 rate = currentRate();
        collectedUSDCents = collectedUSDCents.add(amount.div(rate).mul(100));

        token.mint(to, amount);
    }
    /**
    * @notice This should be called by controller server to send tokens to buyer (if purshased with non-ether currency)
    * @param to address of the buyer
    * @param usdCentsAmount of USD_cents received by controller
    */
    function issueTokensForUSD(address to, uint256 usdCentsAmount) public {
        require (msg.sender == controller);
        require(crowdsaleOpen());

        uint256 rate = currentRate();
        uint256 amount = rate.mul(usdCentsAmount).div(100); // div(100) to convert USD_cents to dollars
        collectedUSDCents = collectedUSDCents.add(usdCentsAmount);

        token.mint(to, amount);
    }
    /**
    * @notice Ajust Ether price
    * @param _usdRate price of 1 USD in Ethereum wei
    */
    function setUsdRate(uint256 _usdRate) public {
        require(msg.sender ==  owner || msg.sender == controller);
        usdRate = _usdRate;
    }

    /**
    * @dev Fetches current Round number
    * @return round number (index in rounds array + 1) or 0 if none
    */
    function currentRoundNum() constant returns(uint8) {
        for(uint8 i=0; i < rounds.length; i++){
            if( (now > rounds[i].start) && (now <= rounds[i].end) ) return i+1;
        }
        return 0;
    }
    /**
    * @dev Fetches current rate (how much ZDR_units (ZDR_unit = 0.00000001 ZDR) one will get for 1 USD)
    * @return current rate or zero (if crowdsale is not running)
    */
    function currentRate() constant returns(uint256) {
        uint8 roundNum = currentRoundNum();
        if(roundNum == 0) {
            return 0;
        }else{
            return rounds[roundNum-1].rate;
        }
    }
    /**
    * @notice Calculates how much tokens should be paid fo specified amount of ether
    * @return how many token units (0.00000001 ZDR) will be paid for provided amount of ether weis in current round
    * @param amount How many wei convert to token units
    */
    function weiToTokenUnits(uint256 amount) constant public returns(uint256) {
        if(usdRate == 0) return 0;
        uint8 roundNum = currentRoundNum();
        if(roundNum == 0) {
            return 0;
        }else{
            uint256 rate = rounds[roundNum-1].rate;
            return amount.mul(rate).div(usdRate); //it's improtant to multiply first
        }
    }
    /**
    * @notice If crowdsale is running
    */
    function crowdsaleOpen() public constant returns(bool){
        return !finalized && (currentRoundNum() > 0);
    }

    /**
    * @notice Updates max gas price for crowdsale transactions
    */
    function setMaxGasPrice(uint256 _maxGasPrice) public onlyOwner  {
        maxGasPrice = _maxGasPrice;
    }

    /**
    * @notice Closes crowdsale, finishes minting (allowing token transfers), transfers token ownership to the owner
    */
    function finalizeCrowdsale() public onlyOwner {
        finalized = true;
        token.finishMinting();
        token.transferOwnership(owner);
        if(this.balance > 0){
            owner.transfer(this.balance);    
        }
    }
    
    /**
    * @notice Change address of controller server
    */
    function setController(address _controller) public onlyOwner {
        controller = _controller;
    }

}

