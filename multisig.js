var $ = jQuery;
jQuery(document).ready(function($) {

    let web3 = null;
    let walletContract = null;
    let tokenContract = null;


    setTimeout(init, 1000);

    function init(){
        web3 = loadWeb3();
        if(web3 == null) return;
        //console.log("web3: ",web3);
        loadContract('./build/contracts/MultisigWallet.json', function(data){
            walletContract = data;
            $('#walletABI').text(JSON.stringify(data.abi));
        });
        loadContract('./build/contracts/ERC20.json', function(data){
            tokenContract = data;
        });
        initPublishWalletForm();
        initManageWalletForm();
        initURLParse();
    }
    function initPublishWalletForm(){
        let form = $('#publishWalletForm');
        let d = new Date();

        $('input[name="owner\[0\]"]', form).val(web3.eth.accounts[0]);
        //$('input[name="owner\[1\]"]', form).val(web3.eth.accounts[1]);
    };
    function initManageWalletForm(){
        $('#proposalsInfo').hide();
    }
    function initURLParse(){
        if(window.location.search == '') return;
        let params = window.location.search.substr(1).split('&').map(function(item){return item.split("=").map(decodeURIComponent);}); //parse GET paramaters of current url
        let walletParam = params.find(function(item){return item[0] == 'wallet'});
        let zdrParam = params.find(function(item){return item[0] == 'zdr'});
        if(typeof walletParam != 'undefined'){
            let wallet  = walletParam[1];
            if(web3.isAddress(wallet)){
                $('input[name=walletAddress]',"#manageWallet").val(wallet);
                setTimeout(function(){  //have to wait a bit for this to work
                    $('#loadWalletInfo').click();    
                }, 100);
            }
        }
        if(typeof zdrParam != 'undefined'){
            let zdr  = zdrParam[1];
            if(web3.isAddress(zdr)){
                $('input[name=zdrAddress]',"#manageWallet").val(zdr);
            }
        }
    }


    $('#publishWallet').click(function(){
        if(walletContract == null) return;
        printError('');
        let form = $('#publishWalletForm');

        let owner1  = $('input[name="owner\[0\]"]', form).val();
        if(!web3.isAddress(owner1)) {alert('Owner1 is not an eth address'); return;}
        let owner2  = $('input[name="owner\[1\]"]', form).val();
        if(!web3.isAddress(owner1)) {alert('Owner2 is not an eth address'); return;}

        let owners = [owner1,  owner2];
        let requiredApprovals = 2;

        publishContract(walletContract, 
            [owners, requiredApprovals],
            function(tx){
                $('input[name=publishedTx]',form).val(tx);
            }, 
            function(contract){
                $('input[name=publishedAddress]',form).val(contract.address);
                $('input[name=walletAddress]', '#manageWallet').val(contract.address);
                contract.token(function(error, result){
                    if(!!error) console.log('Can\'t get token address.\n', error);
                    $('input[name=tokenAddress]',form).val(result);
                    $('#loadCrowdsaleInfo').click();
                });
            }
        );
    });
    $('#loadWalletInfo').click(function(){
        if(walletContract == null) return;
        printError('');
        let form = $('#manageWallet');

        let walletAddress = $('input[name=walletAddress]', form).val();
        if(!web3.isAddress(walletAddress)){printError('Wallet address is not an Ethereum address'); return;}
        let walletInstance = web3.eth.contract(walletContract.abi).at(walletAddress);

        let tokenAddress = $('input[name=zdrAddress]', form).val();
        if(!web3.isAddress(tokenAddress)){printError('ZDR address is not an Ethereum address'); return;}
        let tokenInstance = web3.eth.contract(tokenContract.abi).at(tokenAddress);


        let tbody = $('#proposalsInfo tbody');
        tbody.empty();
        
        function loadProposal(idx){
            walletInstance.proposals(idx, function(error, result){
                if(!!error) console.log('Contract info loading error:\n', error);
                //console.log('Proposal ', result);
                if(result[1] == '0x0000000000000000000000000000000000000000') return;
                if(idx > 100000) return; //prevent endless cycle if somrthign went wrong
                let currency, amount;
                switch(result[0].toNumber()){
                    case 0:
                        currency = 'ETH';
                        amount = web3.fromWei(result[3], 'ether');
                        break;
                    case 1:
                        if(result[2].toLowerCase() == tokenAddress.toLowerCase()){
                            currency = '<span title="'+result[2]+'">ZDR</span>';
                            amount = fromZDRUnits(result[3]);
                        }else{
                            currency = '<span title="'+result[2]+'">TOKEN</span>';
                            amount = result[3].toNumber();
                        }
                        break;
                    default:
                        console.log('Failed to parse proposal type', result[0]);
                }
                //console.log(result[1], currency, amount);
                let tr = $('<tr></tr>').appendTo(tbody)
                    .append('<td>'+idx+'</td>')
                    .append('<td>'+result[1]+'</td>')
                    .append('<td>'+amount+' '+currency+'</td>')
                    .append('<td></td>');
                //console.log(tr);
                let requiredApprovals = 2;
                let statusTd = tr.children().last();
                let statusHtml;
                if(result[5]){
                    $('<span class="proposalStatusExecuted">Executed</span>').appendTo(statusTd);
                }else{
                    let approvals = result[4].toNumber();
                    if(approvals >= requiredApprovals){
                         $('<input type="button" value="Execute">').appendTo(statusTd)
                         .click(function(){
                            $(this).attr('disabled', true)
                            console.log('Executing proposal '+idx+': send '+amount+' of '+currency+' to '+result[1]);
                            walletInstance.executeProposal(idx, function(error3, tx){
                                if(!!error3) {console.log('Contract info loading error:\n', error3); return;}
                                console.log('Proposal execute tx: ', tx);
                                let receipt; 
                                let timer = setInterval(function(){
                                    web3.eth.getTransactionReceipt(tx, function(error4, result4){
                                        if(!!error4) {
                                            console.error('Can\'t get receipt for tx '+tx+'.\n', error4, result4);
                                            return;
                                        }
                                        if(result4 != null){
                                            clearInterval(timer);
                                            if(typeof receipt !== 'undefined') return; //already executed;
                                            receipt = result4;
                                            console.log('Poroposal executed', receipt);
                                            $('#loadWalletInfo').click();
                                        }
                                    });
                                }, 1000);
                            });
                         });  
                    }else{
                        walletInstance.approvals(idx, web3.eth.accounts[0], function(error2, approved){
                            if(!!error2) console.log('Contract info loading error:\n', error2);
                            if(approved){
                                $('<span class="proposalStatusWaiting">Waiting for other owner approval.</span>').appendTo(statusTd);
                            }else{
                                $('<input type="button" value="Approve">').appendTo(statusTd)
                                .click(function(){
                                    $(this).attr('disabled', true)
                                    walletInstance.approveProposal(idx, function(error3, tx){
                                        if(!!error3) {console.log('Contract info loading error:\n', error3); return;}
                                        console.log('Proposal approval tx: ', tx);
                                        let receipt; 
                                        let timer = setInterval(function(){
                                            web3.eth.getTransactionReceipt(tx, function(error4, result4){
                                                if(!!error4) {
                                                    console.error('Can\'t get receipt for tx '+tx+'.\n', error4, result4);
                                                    return;
                                                }
                                                if(result4 != null){
                                                    clearInterval(timer);
                                                    if(typeof receipt !== 'undefined') return; //already executed;
                                                    receipt = result4;
                                                    console.log('Poroposal approved', receipt);
                                                    $('#loadWalletInfo').click();
                                                }
                                            });
                                        }, 1000);
                                    })
                                });  
                            }

                        });
                    }
                }
                loadProposal(idx+1);
            });
        }

        walletInstance.proposalCount(function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            let proposalCount = result.toNumber();
            // for(let i=0; i < proposalCount; i++){
            //     loadProposal(i);
            // }
            if(proposalCount > 0) {
                loadProposal(0);
                $('#proposalsInfo').show();
            } else {
                $('#proposalsInfo').hide();
            }
        });
        $('#newProposalPublish').attr('disabled', true);
        walletInstance.owners(0, function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name="owner\[0\]"]', form).val( result );
            if(web3.eth.accounts[0].toLowerCase() == result.toLowerCase()) $('#newProposalPublish').attr('disabled', false);
        });
        walletInstance.owners(1, function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name="owner\[1\]"]', form).val( result );
            if(web3.eth.accounts[0].toLowerCase() == result.toLowerCase()) $('#newProposalPublish').attr('disabled', false);
        });
        web3.eth.getBalance(walletAddress, function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=ethBalance]', form).val(web3.fromWei(result, 'ether'));
        });
        tokenInstance.balanceOf(walletAddress, function(error, result){
            if(!!error) console.log('Contract info loading error:\n', error);
            $('input[name=zdrBalance]', form).val(fromZDRUnits(result));
        });
            
    });

    $('#newProposalPublish').click(function(){
        if(walletContract == null) return;
        printError('');
        let form = $('#manageWallet');

        let walletAddress = $('input[name=walletAddress]', form).val();
        if(!web3.isAddress(walletAddress)){printError('Wallet address is not an Ethereum address'); return;}
        let walletInstance = web3.eth.contract(walletContract.abi).at(walletAddress);
        let tokenAddress = $('input[name=zdrAddress]', form).val();
        if(!web3.isAddress(tokenAddress)){printError('ZDR address is not an Ethereum address'); return;}
        let tokenInstance = web3.eth.contract(tokenContract.abi).at(tokenAddress);

        let newProposalTo  = $('input[name=newProposalTo]', form).val();
        if(!web3.isAddress(newProposalTo)) {alert('Transfer recepient is not an eth address'); return;}

        let type = $('input[name=newProposalType]:checked', form).val();
        if(typeof type == 'undefined') {alert('Select currency to transfer'); return;}

        let newProposalAmountStr = $('input[name=newProposalAmount]', form).val();
        let newProposalType, newProposalAmount;
        switch(type){
            case 'eth':
                newProposalType = 0;
                newProposalAmount = web3.toWei(newProposalAmountStr);
                break;
            case 'zdr':
                newProposalType = 1;
                newProposalAmount = toZDRUnits(newProposalAmountStr);
                break;
            default:
                alert('Unknows proposal type'); return;
        }
        console.log('Creating proposal:',
            newProposalType, newProposalTo, tokenAddress, newProposalAmount);
        walletInstance.createProposal(
            newProposalType, newProposalTo, tokenAddress, newProposalAmount,
            function(error, tx){
                if(!!error) {console.log('Contract info loading error:\n', error); return;}
                console.log('Proposal creation tx: ', tx);
                let receipt; 
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
                            console.log('Poroposal created', receipt);
                            $('#loadWalletInfo').click();
                        }
                    });
                }, 1000);
            }
        );



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
