var $ = jQuery;
jQuery(document).ready(function($) {

    let web3 = null;
    let tokenContract = null;


    setTimeout(init, 1000);

    function init(){
        web3 = loadWeb3();
        if(web3 == null) return;
        //console.log("web3: ",web3);
        loadContract('./build/contracts/ZDRToken.json', function(data){
            tokenContract = data;
            $('#tokenABI').text(JSON.stringify(data.abi));
        });
        initURLParse();
    }
    function initURLParse(){
        if(window.location.search == '') return;
        let params = window.location.search.substr(1).split('&').map(function(item){return item.split("=").map(decodeURIComponent);}); //parse GET paramaters of current url
        let crowdsaleParam = params.find(function(item){return item[0] == 'token'});
        if(typeof crowdsaleParam != 'undefined'){
            let crowdsale  = crowdsaleParam[1];
            if(web3.isAddress(crowdsale)){
                $('input[name=tokenAddress]',"#manageToken").val(crowdsale);
                setTimeout(function(){  //have to wait a bit for this to work
                    $('#loadTokenInfo').click();    
                }, 100);
            }
        }
    }
    $('#publishToken').click(function(){
        if(tokenContract == null) return;
        printError('');
        let form = $('#publishTokenForm');

        publishContract(tokenContract, 
            [],
            function(tx){
                $('input[name=publishedTx]',form).val(tx);
            }, 
            function(contract){
                $('input[name=publishedAddress]',form).val(contract.address);
                $('input[name=tokenAddress]', '#manageToken').val(contract.address);
                $('#loadTokenInfo').click();
            }
        );
    });
    $('#loadTokenInfo').click(function(){
        if(tokenContract == null) return;
        printError('');
        let form = $('#manageToken');

        let tokenAddress = $('input[name=tokenAddress]', form).val();
        if(!web3.isAddress(tokenAddress)){printError('Token address is not an Ethereum address'); return;}
        let tokenInstance = web3.eth.contract(tokenContract.abi).at(tokenAddress);

        tokenInstance.totalSupply(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=totalSupply]', form).val(fromZDRUnits(result));
        });
        tokenInstance.mintingFinished(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=mintingFinished]', form).val(result?'yes':'no');
        });
    });

    $('#mintTokens').click(function(){
        if(tokenContract == null) return;
        printError('');
        let form = $('#manageToken');

        let tokenAddress = $('input[name=tokenAddress]', form).val();
        if(!web3.isAddress(tokenAddress)){printError('Token address is not an Ethereum address'); return;}
        let tokenInstance = web3.eth.contract(tokenContract.abi).at(tokenAddress);


        let mintTo = $('input[name=mintTo]', form).val();
        if(!web3.isAddress(mintTo)){printError('Mint to address is not an Ethereum address'); return;}
        let mintAmount = toZDRUnits($('input[name=mintAmount]', form).val());

        console.log('Minting tokens to '+mintTo+': ', mintAmount);
        tokenInstance.mint(mintTo, mintAmount, function(error, tx){
            if(!!error){
                console.log('Can\'t execute mint:\n', error);
                printError(error.message.substr(0,error.message.indexOf("\n")));
                return;
            }
            console.log('mint tx:', tx);
            let timer = setInterval(function(){
                web3.eth.getTransactionReceipt(tx, function(error2, result2){
                    if(!!error2) {
                        console.error('Can\'t get receipt for tx '+tx+'.\n', error2, result2);
                        return;
                    }
                    if(result2 != null){
                        clearInterval(timer);
                        if(typeof receipt !== 'undefined') return; //already executed;
                        receipt = result2;
                        console.log('Transaction receipt:', receipt);
                        $('#loadTokenInfo').click();
                    }
                });
            }, 1000);
        });
    });

    $('#finishMinting').click(function(){
        if(tokenContract == null) return;
        printError('');
        let form = $('#manageToken');

        let tokenAddress = $('input[name=tokenAddress]', form).val();
        if(!web3.isAddress(tokenAddress)){printError('Token address is not an Ethereum address'); return;}
        let tokenInstance = web3.eth.contract(tokenContract.abi).at(tokenAddress);

        tokenInstance.finishMinting(function(error, tx){
            if(!!error){
                console.log('Can\'t execute finishMinting:\n', error);
                printError(error.message.substr(0,error.message.indexOf("\n")));
                return;
            }
            console.log('FinishMinting tx:', tx);
            let timer = setInterval(function(){
                web3.eth.getTransactionReceipt(tx, function(error2, result2){
                    if(!!error2) {
                        console.error('Can\'t get receipt for tx '+tx+'.\n', error2, result2);
                        return;
                    }
                    if(result2 != null){
                        clearInterval(timer);
                        if(typeof receipt !== 'undefined') return; //already executed;
                        receipt = result2;
                        console.log('Transaction receipt:', receipt);
                        $('#loadTokenInfo').click();
                    }
                });
            }, 1000);
        });

    });

    $('#openEtherscan').click(function(){
        let form = $('#manageToken');
        let tokenAddress = $('input[name=tokenAddress]', form).val();
        if(!web3.isAddress(tokenAddress)){printError('Token address is not an Ethereum address'); return;}

        console.log(web3.version.getNetwork());
        let explorerUrl;
        let netid = web3.version.getNetwork();
        console.log('netid',netid);
        let url = getExplorerUrl()+'/token/'+tokenAddress;
        window.open(url, '_blank');
    });
    //====================================================

    function loadWeb3(){
        if(typeof window.web3 == "undefined"){
            printError('No MetaMask found');
            return null;
        }
        let Web3 = require('web3');
        let web3 = new Web3();
        web3.setProvider(window.web3.currentProvider);

        if(typeof web3.eth.accounts[0] == 'undefined'){
            printError('Please, unlock MetaMask');
            return null;
        }
        web3.eth.defaultAccount =  web3.eth.accounts[0];
        return web3;
    }
    function loadContract(url, callback){
        $.ajax(url,{'dataType':'json', 'cache':'false', 'data':{'t':Date.now()}}).done(callback);
    }
    function publishContract(contractDef, arguments, txCallback, publishedCallback){
        let contractObj = web3.eth.contract(contractDef.abi);

        let logArgs = arguments.slice(0);
        logArgs.unshift('Creating contract '+contractDef.contract_name+' with arguments:\n');
        logArgs.push('\nABI:\n'+JSON.stringify(contractDef.abi));
        console.log.apply(console, logArgs);

        let publishArgs = arguments.slice(0);
        publishArgs.push({
                from: web3.eth.accounts[0], 
                data: contractDef.unlinked_binary,
        });
        publishArgs.push(function(error, result){
            waitForContractCreation(contractObj, error, result, txCallback, publishedCallback);
        });
        contractObj.new.apply(contractObj, publishArgs);
    }
    function waitForContractCreation(contractObj, error, result, txCallback, publishedCallback){
        if(!!error) {
            console.error('Publishing failed: ', error);
            printError(error.message.substr(0,error.message.indexOf("\n")));
            return;
        }
        if (typeof result.transactionHash !== 'undefined') {
            if(typeof txCallback == 'function'){
                txCallback(result.transactionHash);
            }
            let receipt; 
            let timer = setInterval(function(){
                web3.eth.getTransactionReceipt(result.transactionHash, function(error2, result2){
                    if(!!error2) {
                        console.error('Can\'t get receipt for tx '+result.transactionHash+'.\n', error2, result2);
                        return;
                    }
                    if(result2 != null){
                        clearInterval(timer);
                        if(typeof receipt !== 'undefined') return; //already executed;
                        receipt = result2;
                        let contract = contractObj.at(receipt.contractAddress);
                        console.log('Contract mined at: ' + receipt.contractAddress + ', tx: ' + result.transactionHash+'\n', 'Receipt:\n', receipt,  'Contract:\n',contract);
                        if(typeof publishedCallback === 'function') publishedCallback(contract);
                    }
                });
            }, 1000);
        }else{
            console.error('Unknown error. Result: ', result);
        }
    }

    function timeStringToTimestamp(str){
        return Math.round(Date.parse(str)/1000);
    }
    function timestmapToString(timestamp){
        return (new Date(timestamp*1000)).toISOString();
    }

    function printError(msg){
        if(msg == null || msg == ''){
            $('#errormsg').html('');    
        }else{
            console.error(msg);
            $('#errormsg').html(msg);
        }
    }

    function toZDRUnits(val){
        return (new web3.BigNumber(val)).mul(100000000).round();
    }
    function fromZDRUnits(val){
        return val.div(100000000).toNumber();
    }

    function getExplorerUrl(){
        switch (web3.version.network) {
            case "1":
                return 'https://etherscan.io';
            case "3":
                return 'https://ropsten.etherscan.io';
            case "4":
                return 'https://rinkeby.etherscan.io';
            default:
              console.log('This is an unknown network: '+netId);
              return '';
        }
    }
});
