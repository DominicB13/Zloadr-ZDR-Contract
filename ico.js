var $ = jQuery;
jQuery(document).ready(function($) {

    let web3 = null;
    let tokenContract = null;
    let crowdsaleContract = null;


    setTimeout(init, 1000);

    function init(){
        web3 = loadWeb3();
        if(web3 == null) return;
        //console.log("web3: ",web3);
        loadContract('./build/contracts/ZDRToken.json', function(data){
            tokenContract = data;
            $('#tokenABI').text(JSON.stringify(data.abi));
        });
        loadContract('./build/contracts/ZDRCrowdsale.json', function(data){
            crowdsaleContract = data;
            $('#crowdsaleABI').text(JSON.stringify(data.abi));
        });
        initCrowdsaleForm();
        initURLParse();
    }
    function addCrowdsaleRound(roundName, startTimestamp, endTimestamp, rate){
        let tbody = $('#crowdsaleRoundsForm tbody');
        let roundNum = $('tr', tbody).length;
        //console.log('Add row', roundNum, startTimestamp, endTimestamp, rate);
        $('<tr></tr>').appendTo(tbody)
            .append('<td>'+roundName+'</td>')
            .append('<td><input type="text" name="startTime['+roundNum+']" value="'+timestmapToString(startTimestamp/1000)+'" class="time"></td>')
            .append('<td><input type="text" name="endTime['+roundNum+']" value="'+timestmapToString(endTimestamp/1000)+'" class="time"></td>')
            .append('</td><td><input type="text" name="rate['+roundNum+']" value="'+rate+'" class="number"></td>');
    }
    function initCrowdsaleForm(){
        let form = $('#publishCrowdsaleForm');
        let d = new Date();

        setInterval(function(){$('#clock').val( (new Date()).toISOString() )}, 1000);
        d.setDate(d.getDate()+1);d.setHours(0);
        let tomorrowTimestamp = d.setMinutes(0, 0, 0) - d.getTimezoneOffset()*60*1000;
        addCrowdsaleRound('1', tomorrowTimestamp, tomorrowTimestamp+24*60*60*1000, 0.31);

        $('input[name=ethPrice]', form).val(300);
        $('input[name=ownerTokens]', form).val(10000);
        $('input[name=controller]', form).val(web3.eth.accounts[0]);
        $('input[name=beneficiary]', form).val(web3.eth.accounts[0]);

    };
    function initURLParse(){
        if(window.location.search == '') return;
        let params = window.location.search.substr(1).split('&').map(function(item){return item.split("=").map(decodeURIComponent);}); //parse GET paramaters of current url
        let crowdsaleParam = params.find(function(item){return item[0] == 'crowdsale'});
        if(typeof crowdsaleParam != 'undefined'){
            let crowdsale  = crowdsaleParam[1];
            if(web3.isAddress(crowdsale)){
                $('input[name=crowdsaleAddress]',"#manageCrowdsale").val(crowdsale);
                setTimeout(function(){  //have to wait a bit for this to work
                    $('#loadCrowdsaleInfo').click();    
                }, 100);
            }
        }
    }
    $('#addRound').click(function(){
        let rows = $('#crowdsaleRoundsForm tbody tr');
        let lastRow = rows.length-1
        //console.log(lastRow);
        let lastTimestampInp = $('input[name="endTime\['+lastRow+'\]"]');
        //console.log(lastTimestampInp);
        let lastTimestampStr= lastTimestampInp.val();
        console.log(lastTimestampStr);
        let lastTimestamp = timeStringToTimestamp(lastTimestampStr)*1000;
        addCrowdsaleRound(rows.length+1,lastTimestamp, lastTimestamp+24*60*60*1000, 0);
    });
    $('#publishCrowdsale').click(function(){
        if(crowdsaleContract == null) return;
        printError('');
        let form = $('#publishCrowdsaleForm');

        let ethPrice = $('input[name=ethPrice]', form).val();
        let usdRate = web3.toWei(1/ethPrice, 'ether');

        let ownerTokens  = toZDRUnits($('input[name=ownerTokens]', form).val());
        let controller  = $('input[name=controller]', form).val();
        if(!web3.isAddress(controller)) {alert('Controller is not an eth address'); return;}
        let beneficiary  = $('input[name=beneficiary]', form).val();
        if(!web3.isAddress(beneficiary)) {alert('Beneficiary is not an eth address'); return;}

        let roundsTable = $('#crowdsaleRoundsForm');
        let roundStarts = new Array();
        let roundEnds = new Array();
        let roundRates = new Array();
        let rounds = $('tbody tr', roundsTable).length;
        for(let i = 0; i < rounds; i++){
            roundStarts[i] = timeStringToTimestamp($('input[name=startTime\\['+i+'\\]]', roundsTable).val());
            roundEnds[i] = timeStringToTimestamp($('input[name=endTime\\['+i+'\\]]', roundsTable).val());
            let price = $('input[name=rate\\['+i+'\\]]', roundsTable).val();
            roundRates[i] = (new web3.BigNumber(1).dividedBy(new web3.BigNumber(price))).mul(100000000).round();
        }

        publishContract(crowdsaleContract, 
            [controller, beneficiary, ownerTokens, usdRate, roundStarts, roundEnds, roundRates],
            function(tx){
                $('input[name=publishedTx]',form).val(tx);
            }, 
            function(contract){
                $('input[name=publishedAddress]',form).val(contract.address);
                $('input[name=crowdsaleAddress]', '#manageCrowdsale').val(contract.address);
                contract.token(function(error, result){
                    if(!!error) console.log('Can\'t get token address.\n', error);
                    $('input[name=tokenAddress]',form).val(result);
                    $('#loadCrowdsaleInfo').click();
                });
            }
        );
    });
    $('#loadCrowdsaleInfo').click(function(){
        if(crowdsaleContract == null) return;
        printError('');
        let form = $('#manageCrowdsale');

        let crowdsaleAddress = $('input[name=crowdsaleAddress]', form).val();
        if(!web3.isAddress(crowdsaleAddress)){printError('Crowdsale address is not an Ethereum address'); return;}
        let crowdsaleInstance = web3.eth.contract(crowdsaleContract.abi).at(crowdsaleAddress);

        let tbody = $('#crowdsaleRoundsInfo tbody');
        tbody.empty();
        function loadRound(roundNum){
            crowdsaleInstance.rounds(roundNum, function(error, result){
                if(!!error) console.log('Contract info loading error:\n', error);
                if(result[0].toNumber() == 0 || roundNum > 10000) return;
                $('<tr></tr>').appendTo(tbody)
                    .append('<td>'+(roundNum+1)+'</td>')
                    .append('<td><input type="text" readonly name="startTime['+roundNum+']" value="'+timestmapToString(result[0].toNumber())+'" class="time"></td>')
                    .append('<td><input type="text" readonly name="endTime['+roundNum+']" value="'+timestmapToString(result[1].toNumber())+'" class="time"></td>')
                    .append('</td><td><input type="text"  readonly name="rate['+roundNum+']" value="'+result[2].toNumber()+'" class="number"></td>');
                loadRound(roundNum+1);
            });

        }
        loadRound(0);
        crowdsaleInstance.usdRate(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            let ethPrice = (new web3.BigNumber(1).div(new web3.BigNumber(result))).mul(1000000000000000000);
            $('input[name=ethPrice]', form).val( ethPrice );
            $('input[name=newEthPrice]', form).val(ethPrice);
        });
        crowdsaleInstance.collectedEther(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=collectedEther]', form).val(web3.fromWei(result, 'ether'));
        });
        crowdsaleInstance.collectedUSDCents(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=collectedUSD]', form).val(result.div(100).toNumber());
        });
        crowdsaleInstance.weiToTokenUnits(web3.toWei(1, 'ether'), function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=currentRate]', form).val(fromZDRUnits(result));
        });
        crowdsaleInstance.controller(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=controller]', form).val(result);
        });
        crowdsaleInstance.beneficiary(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=beneficiary]', form).val(result);
        });
        crowdsaleInstance.token(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=tokenAddress]', form).val(result);
        });
    });
    $('#updateUsdRate').click(function(){
        if(crowdsaleContract == null) return;
        printError('');
        let form = $('#manageCrowdsale');

        let crowdsaleAddress = $('input[name=crowdsaleAddress]', form).val();
        if(!web3.isAddress(crowdsaleAddress)){printError('Crowdsale address is not an Ethereum address'); return;}
        let crowdsaleInstance = web3.eth.contract(crowdsaleContract.abi).at(crowdsaleAddress);

        let ethPrice = $('input[name=newEthPrice]', form).val();
        let usdRate = web3.toWei(1/ethPrice, 'ether');

        console.log('Updating usdRate: ', usdRate);
        crowdsaleInstance.setUsdRate(usdRate, function(error, tx){
            if(!!error){
                console.log('Can\'t execute setUsdRate:\n', error);
                printError(error.message.substr(0,error.message.indexOf("\n")));
                return;
            }
            console.log('setUsdRate tx:', tx);
            $('#loadCrowdsaleInfo').click();
        });
    });
    $('#issueTokens').click(function(){
        if(crowdsaleContract == null) return;
        printError('');
        let form = $('#manageCrowdsale');

        let crowdsaleAddress = $('input[name=crowdsaleAddress]', form).val();
        if(!web3.isAddress(crowdsaleAddress)){printError('Crowdsale address is not an Ethereum address'); return;}
        let crowdsaleInstance = web3.eth.contract(crowdsaleContract.abi).at(crowdsaleAddress);


        let issueTo = $('input[name=issueTo]', form).val();
        if(!web3.isAddress(issueTo)){printError('Issue to address is not an Ethereum address'); return;}
        let issueTokens = toZDRUnits($('input[name=issueTokens]', form).val());

        console.log('Issuing tokens to '+issueTo+': ', issueTokens);
        crowdsaleInstance.issueTokens(issueTo, issueTokens, function(error, tx){
            if(!!error){
                console.log('Can\'t execute issueTokens:\n', error);
                printError(error.message.substr(0,error.message.indexOf("\n")));
                return;
            }
            console.log('issueTokens tx:', tx);
            $('#loadCrowdsaleInfo').click();
        });
    });
    $('#issueTokensUSD').click(function(){
        if(crowdsaleContract == null) return;
        printError('');
        let form = $('#manageCrowdsale');

        let crowdsaleAddress = $('input[name=crowdsaleAddress]', form).val();
        if(!web3.isAddress(crowdsaleAddress)){printError('Crowdsale address is not an Ethereum address'); return;}
        let crowdsaleInstance = web3.eth.contract(crowdsaleContract.abi).at(crowdsaleAddress);


        let issueTo = $('input[name=issueToUSD]', form).val();
        if(!web3.isAddress(issueTo)){printError('Issue to address is not an Ethereum address'); return;}
        let usdCentsValue = $('input[name=issueAmountUSD]', form).val() * 100;

        console.log('Issuing tokens (for USD) to '+issueTo+': ', usdCentsValue);
        crowdsaleInstance.issueTokensForUSD(issueTo, usdCentsValue, function(error, tx){
            if(!!error){
                console.log('Can\'t execute issueTokensForUSD:\n', error);
                printError(error.message.substr(0,error.message.indexOf("\n")));
                return;
            }
            console.log('issueTokensForUSD tx:', tx);
            $('#loadCrowdsaleInfo').click();
        });
    });

    $('#crowdsaleFinalize').click(function(){
        if(crowdsaleContract == null) return;
        printError('');
        let form = $('#manageCrowdsale');

        let crowdsaleAddress = $('input[name=crowdsaleAddress]', form).val();
        if(!web3.isAddress(crowdsaleAddress)){printError('Crowdsale address is not an Ethereum address'); return;}
        let crowdsaleInstance = web3.eth.contract(crowdsaleContract.abi).at(crowdsaleAddress);

        crowdsaleInstance.finalizeCrowdsale(function(error, tx){
            if(!!error){
                console.log('Can\'t execute finalizeCrowdsale:\n', error);
                printError(error.message.substr(0,error.message.indexOf("\n")));
                return;
            }
            console.log('FinalizeCrowdsale tx:', tx);
            $('#loadCrowdsaleInfo').click();
        });

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
                data: contractDef.bytecode,
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
});
