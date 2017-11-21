var $ = jQuery;
jQuery(document).ready(function($) {

    let web3 = null;
    let tokenContract = null;
    let migrationContract = null;


    setTimeout(init, 1000);

    function init(){
        web3 = loadWeb3();
        if(web3 == null) return;
        //console.log("web3: ",web3);
        loadContract('./build/contracts/ZDRToken.json', function(data){
            tokenContract = data;
            $('#tokenABI').text(JSON.stringify(data.abi));
        });
        loadContract('./build/contracts/MintableMigration.json', function(data){
            migrationContract = data;
            $('#migrationABI').text(JSON.stringify(data.abi));
        });
        initURLParse();
    }
    function initURLParse(){
        if(window.location.search == '') return;
        let params = window.location.search.substr(1).split('&').map(function(item){return item.split("=").map(decodeURIComponent);}); //parse GET paramaters of current url
        
        let oldToken = getUrlParam('old');
        let newToken = getUrlParam('new');
        let migration = getUrlParam('migration');
        if(oldToken) $('input[name=oldTokenAddress]', '#collectDataForm').val(oldToken);
        if(newToken) $('input[name=newTokenAddress]', '#mintTokensForm').val(newToken);
        if(migration) $('input[name=migrationAddress]', '#mintTokensForm').val(migration);
    }
    $('#publishMigration').click(function(){
        if(migrationContract == null) return;
        printError('');
        let form = $('#migrationContractForm');

        publishContract(migrationContract, 
            [],
            function(tx){
                $('input[name=publishedTx]',form).val(tx);
            }, 
            function(contract){
                $('input[name=publishedAddress]',form).val(contract.address);
                $('input[name=migrationAddress]', '#mintTokensForm').val(contract.address);
                contract.token(function(error, result){
                    if(!!error) console.log('Can\'t get token address.\n', error);
                    $('input[name=tokenAddress]',form).val(result);
                });
            }
        );
    });

    $('#collectData').click(function(){
        if(tokenContract == null) return;
        printError('');
        let form = $('#collectDataForm');

        let tokenAddress = $('input[name=oldTokenAddress]', form).val();
        let tokenInstance = loadContractInstance(tokenContract, tokenAddress);

        let balances = new Map();

        // let transferEvent = tokenInstance.Transfer({},{
        //     'fromBlock':0,
        //     'toBlock':'latest'
        // });
        // console.log(transferEvent);
        // transferEvent.get(function(error, log){
        //     console.log(error, log);
        // });
        let etherscanAPI = 'https://rinkeby.etherscan.io/api';
        //let etherscanAPI = 'https://api.etherscan.io/api';
        let etherscanAPIKEY = '3ETYIJ4T3ZMKMUHHQAVE421BPN2FG4JJZW';
        $.ajax(etherscanAPI,{
            'dataType':'json', 
            'cache':'false', 
            'data':{
                't':Date.now(),
                'module':'logs',
                'action':'getLogs',
                'fromBlock': 0,
                'toBlock':'latest',
                'address': tokenAddress,
                'topic0': '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', //Transfer event
                'apikey':etherscanAPIKEY
            }
        }).done(function(responce){
            console.log(responce);
            if(responce.message != 'OK'){
                console.log('Failed to get data from EtherScan', responce);
                return;
            }
            console.log('Total Transfer events: '+responce.result.length);
            for(let i=0; i < responce.result.length; i++){
                let entry = responce.result[i];
                let from = entry.topics[1].replace('0x000000000000000000000000', '0x');
                if(!web3.isAddress(from)){
                    console.error('Can not parse address: ',entry.topics[1]);
                    continue;                    
                }
                let to = entry.topics[2].replace('0x000000000000000000000000', '0x');
                if(!web3.isAddress(to)){
                    console.error('Can not parse address: ',entry.topics[2]);
                    continue;                    
                }
                let amount = new web3.BigNumber(entry.data);
                if(from == '0x0000000000000000000000000000000000000000'){
                    console.log('Mint to '+to+' - '+amount.div(100000000).toNumber()+' ZDR');    
                }else{
                    console.log('Transfer from '+from+' to '+to+' - '+amount.div(100000000).toNumber()+' ZDR');    
                }
                if(from != '0x0000000000000000000000000000000000000000'){
                    let currentFromBalance = balances.get(from);
                    if(typeof currentFromBalance == 'undefined'){
                        console.error('Decreasing from unknown address');
                        balances.set(from, amount.mul(-1));
                    }else{
                        balances.set(from, currentFromBalance.minus(amount));
                    }
                }
                if(to != '0x0000000000000000000000000000000000000000'){
                    let currentToBalance = balances.get(to);
                    if(typeof currentToBalance == 'undefined'){
                        balances.set(to, amount);
                    }else{
                        balances.set(to, currentToBalance.plus(amount));
                    }
                }
            }
            //console.log(balances);
            console.log('Total holders: '+balances.size);

            let nonZeroHolders = 0;
            let holders = new Array();
            balances.forEach(function(value, key, map){
                console.log('Holder '+key+' has '+value.div(100000000).toNumber()+' ZDR');
                //console.log('Holder '+key+' has ',value,' ZDR');
                holders.push(key);
                if(!value.isZero()) nonZeroHolders++;
            });
            //console.log(holders);
            console.log('Total non-zero holders: '+nonZeroHolders);
            $('#tokenHolders').val(JSON.stringify(holders));
            $('input[name=toHolder]', '#mintTokensForm').val(holders.length);
        });

    });

    $('#executeMigration').click(function(){
        if(migrationContract == null) return;
        printError('');
        let form = $('#mintTokensForm');

        let migrationAddress = $('input[name=migrationAddress]', form).val();
        let migrationInstance = loadContractInstance(migrationContract, migrationAddress);

        let oldToken = $('input[name=oldTokenAddress]', '#collectDataForm').val();
        if(!web3.isAddress(oldToken)){console.error('Bad old token address', oldToken); return;}

        // let newToken = $('input[name=newTokenAddress]', form).val();
        // if(!web3.isAddress(newToken)){console.error('Bad new token address', newToken); return;}

        let fromHolder = $('input[name=fromHolder]', form).val();
        let toHolder = $('input[name=toHolder]', form).val();

        let holders = JSON.parse($('#tokenHolders').val());
        let holdersToMint = holders.slice(fromHolder, toHolder);
        //console.log(holdersToMint);

        // console.log('Migrating from '+oldToken+' to '+newToken+' for holders '+fromHolder+' to '+toHolder+':', holdersToMint);
        // migrationInstance.migrate(oldToken, newToken, holdersToMint, function(error, tx){
        //     console.log('Migrate transaction: ', tx);
        // })

        console.log('Migrating from '+oldToken+' for holders '+fromHolder+' to '+toHolder+':', holdersToMint);
        migrationInstance.migrate(oldToken, holdersToMint, function(error, tx){
            console.log('Migrate transaction: ', tx);
        })


    });

    $('#transferTokenOwnership').click(function(){
        if(migrationContract == null) return;
        printError('');
        let form = $('#mintTokensForm');

        let migrationAddress = $('input[name=migrationAddress]', form).val();
        let migrationInstance = loadContractInstance(migrationContract, migrationAddress);

        migrationInstance.transferTokenOwnership(function(error, tx){
            console.log('TransferTokenOwnership transaction: ', tx);  
        })
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
    function getUrlParam(name){
        if(window.location.search == '') return null;
        let params = window.location.search.substr(1).split('&').map(function(item){return item.split("=").map(decodeURIComponent);});
        let found = params.find(function(item){return item[0] == name});
        return (typeof found == "undefined")?null:found[1];
    }
    function loadContract(url, callback){
        $.ajax(url,{'dataType':'json', 'cache':'false', 'data':{'t':Date.now()}}).done(callback);
    }
    function loadContractInstance(contractDef, address){
        if(typeof contractDef == 'undefined' || contractDef == null) return null;
        printError('');
        if(!web3.isAddress(address)){printError('Contract '+contractDef.contract_name+' address '+address+'is not an Ethereum address'); return null;}
        return web3.eth.contract(contractDef.abi).at(address);
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
                data: contractDef.bytecode, //https://github.com/trufflesuite/truffle-contract-schema
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
